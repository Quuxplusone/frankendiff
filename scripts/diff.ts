/**
 * Diff between a row of 1818 and its counterpart in 1831.  A row is one
 * paragraph, or several joined by PARAGRAPH_BREAK when one edition split or
 * merged paragraphs the other kept whole (see lib/types.ts).
 *
 * The diff runs in four stages:
 *
 *   1. Clause level.  Both texts are split into clauses (at sentence and
 *      clause punctuation) and aligned with a Needleman–Wunsch pass that only
 *      pairs clauses sharing enough vocabulary.  A clause may pair with two
 *      or three neighbours when only the punctuation at a boundary changed.
 *   2. Word level.  Each paired clause is diffed word by word with a weighted
 *      LCS (words count, punctuation half, whitespace barely) and tidied so
 *      that a rewritten phrase reads as one block rather than a scatter of
 *      matched function words.
 *   3. Second chance.  Every deletion/insertion run — unpaired clauses, or a
 *      paired clause whose tail was rewritten — keeps long shared phrases as
 *      anchors; the rest collapses.
 *   4. Presentation.  Within a run, deletions come before insertions, and
 *      whitespace or delimiters both sides share stay outside the coloured
 *      text.
 *
 * Anchoring on clauses is what lets "Every one adored Elizabeth." diff
 * against "Every one loved Elizabeth." even when the rest of the paragraph
 * was rewritten from scratch: a whole-paragraph similarity check would
 * throw the shared sentence away with the rest.
 *
 * Whatever the diff decides, the ops always reconstruct both texts exactly
 * (equal + delete = 1818, equal + insert = 1831); tests/ guards that.
 *
 * The file is laid out tooling first: tokens and the weighted LCS, the
 * cleanup passes, then the word level, the clause level, and finally the
 * assembly in computeDiff.
 */

import { DiffOp, DiffOpType } from '../lib/types'

// ── Tokens and the weighted LCS ─────────────────────────────────────────────

/**
 * Split text into fine-grained tokens: words (with apostrophes for
 * contractions), individual punctuation characters, and whitespace runs.
 * An escaped asterisk `\*` (a literal asterisk, see lib/utils.tsx) is one
 * token, so the diff never separates it from its backslash.
 *
 * Splitting punctuation from words means a change like "excellent," → "excellent"
 * will only highlight the comma rather than the entire word.
 */
function tokenize(text: string): string[] {
  return text.match(/\\\*|\w+(?:['’]\w+)*|[^\w\s]|\s+/g) ?? []
}

/** Lower-cased words of a text, for similarity measures. */
function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

/**
 * Weight of a token in the LCS objective.  Words count in full, punctuation
 * half, whitespace almost nothing: an unweighted LCS happily matches two
 * scattered words plus the spaces around them in preference to one
 * three-word phrase, which is exactly the "messy" colouring readers object
 * to.  Whitespace keeps a token weight so that, all else equal, the spaces
 * around a changed word still line up.  (Integers, so the traceback can
 * compare sums exactly.)
 */
function tokenWeight(token: string): number {
  if (/^\s+$/.test(token)) return 1
  if (/^(?:[^\w\s]|\\\*)$/.test(token)) return 50
  return 100
}

/** Build the weighted-LCS DP table for two token arrays. */
function buildLCS(a: string[], b: string[]): number[][] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const diag = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + tokenWeight(a[i - 1]) : -1
      dp[i][j] = Math.max(diag, dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp
}

/** Merge consecutive ops of the same type. */
function mergeOps(ops: DiffOp[]): DiffOp[] {
  const merged: DiffOp[] = []
  for (const op of ops) {
    const last = merged[merged.length - 1]
    if (last && last.type === op.type) {
      last.text += op.text
    } else {
      merged.push({ ...op })
    }
  }
  return merged
}

/** Raw word-level LCS ops of two texts, before any cleanup. */
function rawWordOps(textA: string, textB: string): DiffOp[] {
  const tokensA = tokenize(textA)
  const tokensB = tokenize(textB)
  const dp = buildLCS(tokensA, tokensB)

  const raw: { type: DiffOpType; text: string }[] = []
  let i = tokensA.length
  let j = tokensB.length

  // Walk back through the table, taking an equal token only when it lies on
  // an optimal path.
  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      tokensA[i - 1] === tokensB[j - 1] &&
      dp[i][j] === dp[i - 1][j - 1] + tokenWeight(tokensA[i - 1])
    ) {
      raw.unshift({ type: 'equal', text: tokensA[i - 1] })
      i--
      j--
    } else if (
      j > 0 &&
      (i === 0 || dp[i][j - 1] >= dp[i - 1][j])
    ) {
      raw.unshift({ type: 'insert', text: tokensB[j - 1] })
      j--
    } else {
      raw.unshift({ type: 'delete', text: tokensA[i - 1] })
      i--
    }
  }
  return mergeOps(raw)
}

// ── Cleanup passes (run on the raw word-level ops) ──────────────────────────

/**
 * Collapse the "every word highlighted" pattern that arises when two texts
 * are heavily rewritten.
 *
 * The LCS algorithm matches whitespace tokens that appear in both texts,
 * producing a sequence like:
 *   del "My"  eq " "  ins "From"  eq " "  del "father"  eq " "  ins "Italy" …
 *
 * This pass walks through the ops and, whenever it finds a run of del/ins ops
 * separated only by whitespace-only equal ops, merges them into a single del
 * block and a single ins block, preserving natural word spacing in each:
 *   del "My father …"  ins "From Italy …"
 *
 * The whitespace is assigned to whichever side (del or ins) it immediately
 * follows, so both blocks read naturally without double-counted spaces.
 */
function cleanupEditZones(ops: DiffOp[]): DiffOp[] {
  const result: DiffOp[] = []
  let i = 0

  while (i < ops.length) {
    const op = ops[i]

    if (op.type === 'equal') {
      result.push(op)
      i++
      continue
    }

    // Collect a contiguous edit zone: del/ins ops with only whitespace-only
    // equal ops between them.
    let delText = ''
    let insText = ''

    while (i < ops.length) {
      const cur = ops[i]
      const next = ops[i + 1]

      if (cur.type === 'delete') {
        delText += cur.text
        i++
      } else if (cur.type === 'insert') {
        insText += cur.text
        i++
      } else if (
        cur.type === 'equal' &&
        /^\s+$/.test(cur.text) &&
        next &&
        next.type !== 'equal'
      ) {
        // The whitespace belongs to both texts, so absorb it into both blocks
        // so each reads naturally (e.g. "My father had" not "Myfatherhad").
        delText += cur.text
        insText += cur.text
        i++
      } else {
        break
      }
    }

    if (delText) result.push({ type: 'delete', text: delText })
    if (insText) result.push({ type: 'insert', text: insText })
  }

  return result
}

/** True for an equal op made only of whitespace and punctuation. */
function isDelimiter(op: DiffOp): boolean {
  return op.type === 'equal' && /^[\s\p{P}]+$/u.test(op.text)
}

/**
 * Collapse "chaotic zones" — contiguous regions where the word-level diff is
 * fragmented because the LCS matched scattered function words rather than
 * genuine semantic phrases.
 *
 * The op stream is split at "anchor" equal ops (at least `anchorMinChars`
 * long, so unambiguously shared content).  Between two anchors is a "zone".
 * If the Dice similarity of the zone's equal content to its total content is
 * below `zoneMinDice`, the zone collapses to one deletion and one insertion,
 * reconstructed from its del/ins/equal ops.
 *
 * The thresholds depend on what is being cleaned: inside a paired clause the
 * defaults apply; anchorDiff, which works on text already judged dissimilar
 * at clause level, passes stricter ones.
 */
function cleanupChaoticZones(
  ops: DiffOp[],
  anchorMinChars = 15,
  zoneMinDice = 0.25,
): DiffOp[] {

  const result: DiffOp[] = []
  let i = 0

  while (i < ops.length) {
    const op = ops[i]

    if (op.type === 'equal' && op.text.length >= anchorMinChars) {
      result.push(op)
      i++
      continue
    }

    // Collect a zone until the next anchor (large equal) or end of ops.
    let j = i
    let text1818 = ''
    let text1831 = ''
    let equalChars = 0

    while (j < ops.length) {
      const cur = ops[j]
      if (cur.type === 'equal' && cur.text.length >= anchorMinChars) break
      if (cur.type === 'delete') {
        text1818 += cur.text
      } else if (cur.type === 'insert') {
        text1831 += cur.text
      } else {
        text1818 += cur.text
        text1831 += cur.text
        equalChars += cur.text.length
      }
      j++
    }

    const totalChars = text1818.length + text1831.length
    const dice = totalChars === 0 ? 1 : (2 * equalChars) / totalChars

    if (dice < zoneMinDice) {
      // A shared delimiter at either end of the zone (a full stop, a space)
      // stays shared, so the collapse reads "word[-old-]{+new+}." and not
      // "word[-old.-]{+new.+}".
      let from = i
      let to = j
      const lead = ops[from]
      if (to - from > 1 && isDelimiter(lead)) { from++; text1818 = text1818.slice(lead.text.length); text1831 = text1831.slice(lead.text.length) }
      const trail = ops[to - 1]
      if (to - from > 1 && isDelimiter(trail)) { to--; text1818 = text1818.slice(0, -trail.text.length); text1831 = text1831.slice(0, -trail.text.length) }
      if (from > i) result.push(lead)
      if (text1818) result.push({ type: 'delete', text: text1818 })
      if (text1831) result.push({ type: 'insert', text: text1831 })
      if (to < j) result.push(trail)
    } else {
      for (let k = i; k < j; k++) result.push(ops[k])
    }

    i = j
  }

  return result
}

/**
 * Absorb "noise equal" islands — single-word equal ops that are completely
 * surrounded by edits on both sides and are shorter than both neighbouring
 * edit blocks.  (Two or more shared words in a row — a name, a phrase — are
 * kept; they are what the reader is looking for.)
 *
 * Example: [del "My father had a sister"] eq "my" [ins "From Italy they visited"]
 * The equal "my" (2 chars) is far shorter than either edit, so it adds no
 * useful context and only fragments the highlighted region.  Absorbing it
 * gives:  [del "My father had a sistermy"] [ins "myFrom Italy they visited"]
 * which, after a subsequent mergeOps call, becomes a single del and a single
 * ins spanning the whole passage.
 *
 * The loop runs repeatedly until no more islands can be absorbed (handles
 * cascading cases where removing one island creates another).
 */
function cleanupSemanticIslands(ops: DiffOp[]): DiffOp[] {
  let arr = ops.map((op) => ({ ...op }))
  let changed = true

  while (changed) {
    changed = false

    for (let i = 1; i < arr.length - 1; i++) {
      const prev = arr[i - 1]
      const curr = arr[i]
      const next = arr[i + 1]

      if (
        curr.type === 'equal' &&
        prev.type !== 'equal' &&
        next.type !== 'equal' &&
        words(curr.text).length <= 1 &&
        curr.text.length <= prev.text.length &&
        curr.text.length <= next.text.length
      ) {
        // The island belongs to both texts, so it must be emitted once as a
        // delete and once as an insert.  When the neighbours differ in type,
        // each absorbs a copy.  When both are the same type (e.g. two inserts
        // around a shared word), absorbing into both would put the text on
        // that side twice and never on the other — so the island becomes a
        // pair of ops instead, one merged into `prev` and one of the opposite
        // type standing on its own.
        if (prev.type !== next.type) {
          prev.text += curr.text
          next.text = curr.text + next.text
          arr.splice(i, 1)
        } else {
          prev.text += curr.text
          arr.splice(i, 1, {
            type: prev.type === 'delete' ? 'insert' : 'delete',
            text: curr.text,
          })
        }
        arr = mergeOps(arr)
        changed = true
        break
      }
    }
  }

  return arr
}

const FULL_REPLACEMENT = (a: string, b: string): DiffOp[] => [
  { type: 'delete', text: a },
  { type: 'insert', text: b },
]

/** Equal characters as a fraction of both texts' characters. */
function equalFraction(ops: DiffOp[], a: string, b: string): number {
  const equalChars = ops
    .filter((op) => op.type === 'equal')
    .reduce((sum, op) => sum + op.text.length, 0)
  return (a.length + b.length) === 0 ? 1 : equalChars / (a.length + b.length)
}

// ── Word level ──────────────────────────────────────────────────────────────

/**
 * Inside a paired clause the word diff must keep either a fifth of the
 * characters as shared text or one shared phrase of ANCHOR_MIN_CHARS;
 * otherwise the shared words were scattered function words and the clause
 * reads better as a plain replacement.
 */
const CLAUSE_MIN_EQUAL_FRACTION = 0.2

/** A shared run this long (and at least ANCHOR_MIN_WORDS words) is a phrase
 *  worth showing on its own, even inside otherwise rewritten text. */
const ANCHOR_MIN_CHARS = 20
const ANCHOR_MIN_WORDS = 4

/** Between anchors in text already judged dissimilar at clause level, only
 *  zones that are mostly shared survive; anything looser collapses. */
const ANCHOR_ZONE_MIN_DICE = 0.5

function isAnchor(op: DiffOp): boolean {
  return op.type === 'equal' &&
    op.text.length >= ANCHOR_MIN_CHARS &&
    words(op.text).length >= ANCHOR_MIN_WORDS
}

/** Word-level diff of two clauses that the clause aligner has paired. */
function wordDiff(textA: string, textB: string): DiffOp[] {
  if (textA === textB) return [{ type: 'equal', text: textA }]

  const result = cleanupChaoticZones(cleanupSemanticIslands(cleanupEditZones(rawWordOps(textA, textB))))

  if (equalFraction(result, textA, textB) < CLAUSE_MIN_EQUAL_FRACTION && !result.some(isAnchor)) {
    return FULL_REPLACEMENT(textA, textB)
  }
  return result
}

/**
 * Diff of a deletion/insertion pair — clauses the aligner could not pair, or
 * a rewritten tail.  Only long shared phrases survive as anchors (a sentence
 * opening kept while its tail was rewritten, a name and title carried
 * across); everything between them collapses to a deletion and an insertion.
 * Returns null when there is no anchor at all.
 */
function anchorDiff(textA: string, textB: string): DiffOp[] | null {
  const result = cleanupChaoticZones(
    cleanupSemanticIslands(cleanupEditZones(rawWordOps(textA, textB))),
    ANCHOR_MIN_CHARS,
    ANCHOR_ZONE_MIN_DICE,
  )
  return result.some(isAnchor) ? result : null
}

// ── Clause level ────────────────────────────────────────────────────────────

/**
 * Two clauses are paired only if their word Dice coefficient reaches this.
 * 0.45 pairs "Do you not remember Justine Moritz?" with "Do you remember on
 * what occasion Justine Moritz entered our family?" (≈0.6) but not two
 * sentences that merely share "the", "and" and "of".
 */
const CLAUSE_MIN_DICE = 0.45

/** A full stop after one of these is an abbreviation, not a clause boundary. */
const ABBREVIATIONS = new Set(['mr', 'mrs', 'dr', 'st', 'messrs'])

/**
 * Split a text into clauses.  A clause ends after sentence or clause
 * punctuation (. ? ! ; :) plus any closing quotes and the whitespace that
 * follows; the whitespace stays with the clause so the clauses concatenate
 * back to the original text.  A paragraph break (blank line) always ends a
 * clause.  Abbreviations ("M. Moritz", "St. George") do not.
 */
export function splitClauses(text: string): string[] {
  const clauses: string[] = []
  let start = 0
  const boundary = /[.?!;:]+["\u201d\u2019')\]]*(\s+)|\n\n/g
  let m: RegExpExecArray | null
  while ((m = boundary.exec(text)) !== null) {
    const end = m.index + m[0].length
    if (m[0] !== '\n\n') {
      const before = text.slice(start, m.index)
      const lastWord = before.match(/(\S+)$/)?.[1] ?? ''
      // "M." (one capital letter) or a known abbreviation: keep going.
      if (/^[A-Z]$/.test(lastWord) || ABBREVIATIONS.has(lastWord.toLowerCase())) continue
    }
    clauses.push(text.slice(start, end))
    start = end
  }
  if (start < text.length) clauses.push(text.slice(start))
  return clauses
}

/** Shared-word count and Dice coefficient of two word multisets. */
function clauseOverlap(wa: string[], wb: string[]): { shared: number; dice: number } {
  const counts = new Map<string, number>()
  for (const w of wa) counts.set(w, (counts.get(w) ?? 0) + 1)
  let shared = 0
  for (const w of wb) {
    const c = counts.get(w) ?? 0
    if (c > 0) {
      shared++
      counts.set(w, c - 1)
    }
  }
  const total = wa.length + wb.length
  return { shared, dice: total === 0 ? 1 : (2 * shared) / total }
}

/**
 * One step of a clause alignment: `a` clauses of 1818 paired with `b`
 * clauses of 1831.  (1,0) and (0,1) are unpaired clauses; (1,2), (2,1) and
 * (2,2) pair a clause with two neighbours, which is what happens when an
 * edition changed the punctuation at a clause boundary ("procure, and" →
 * "procure; and") so that one side splits where the other does not; (1,3)
 * and (3,1) cover a sentence whose commas became semicolons.
 */
interface ClauseStep { a: number; b: number }

const CLAUSE_STEPS: ClauseStep[] = [
  { a: 1, b: 1 },
  { a: 1, b: 2 }, { a: 2, b: 1 }, { a: 2, b: 2 },
  { a: 1, b: 3 }, { a: 3, b: 1 },
]

/** Cost of each clause beyond one per side in a paired step, so that a
 *  merged pair only wins when it actually shares more words. */
const MERGE_PENALTY = 0.5

/**
 * A merged step must look like the same text with a moved boundary, so it
 * needs a higher Dice than a plain pair; otherwise a long unrelated clause
 * can ride in on shared function words and drag a good pair down with it.
 */
const MERGE_MIN_DICE = 0.6

/**
 * Align two clause lists monotonically (Needleman–Wunsch), maximising the
 * number of shared words over paired clauses.  A pairing is allowed only when
 * its Dice coefficient reaches CLAUSE_MIN_DICE (MERGE_MIN_DICE for a merged
 * step, which also pays MERGE_PENALTY per extra clause); unpaired clauses
 * cost nothing.  Returns the steps in order; each step's texts are the
 * concatenation of the clauses it covers.
 */
function alignClauses(A: string[], B: string[]): ClauseStep[] {
  const n = A.length
  const m = B.length
  const score: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  const choice: (ClauseStep | null)[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null))

  const wordsA = A.map(words)
  const wordsB = B.map(words)
  const join = (list: string[][], end: number, count: number) => list.slice(end - count, end).flat()

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      if (i === 0 && j === 0) continue
      let best = -Infinity
      let bestStep: ClauseStep | null = null
      if (i > 0 && score[i - 1][j] > best) { best = score[i - 1][j]; bestStep = { a: 1, b: 0 } }
      if (j > 0 && score[i][j - 1] > best) { best = score[i][j - 1]; bestStep = { a: 0, b: 1 } }
      for (const step of CLAUSE_STEPS) {
        if (i < step.a || j < step.b) continue
        const merged = step.a + step.b > 2
        const { shared, dice } = clauseOverlap(join(wordsA, i, step.a), join(wordsB, j, step.b))
        if (shared === 0 || dice < (merged ? MERGE_MIN_DICE : CLAUSE_MIN_DICE)) continue
        const s = score[i - step.a][j - step.b] + shared - MERGE_PENALTY * (step.a + step.b - 2)
        if (s > best) { best = s; bestStep = step }
      }
      score[i][j] = best
      choice[i][j] = bestStep
    }
  }

  const steps: ClauseStep[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    const step = choice[i][j]!
    steps.unshift(step)
    i -= step.a
    j -= step.b
  }
  return steps
}

// ── Assembly ────────────────────────────────────────────────────────────────

/**
 * Within a run of non-equal ops, emit every deletion before every insertion
 * (each side keeps its own order, so both texts still reconstruct exactly),
 * and move whitespace the two sides share at either end out of the run — or
 * a shared delimiter, when one side is nothing else (see commonAffix).
 * The reader then always sees 1818's words first, then 1831's, a run like
 * del/ins/del collapses to one of each, and "one[- adored-]{+ loved+}"
 * becomes "one [-adored-]{+loved+}".
 */
function normalizeRuns(ops: DiffOp[]): DiffOp[] {
  const result: DiffOp[] = []
  let del = ''
  let ins = ''
  const flush = () => {
    if (del && ins) {
      const lead = commonAffix(del, ins, 'start')
      const trail = commonAffix(del.slice(lead.length), ins.slice(lead.length), 'end')
      del = del.slice(lead.length, del.length - trail.length)
      ins = ins.slice(lead.length, ins.length - trail.length)
      if (lead) result.push({ type: 'equal', text: lead })
      if (del) result.push({ type: 'delete', text: del })
      if (ins) result.push({ type: 'insert', text: ins })
      if (trail) result.push({ type: 'equal', text: trail })
    } else {
      if (del) result.push({ type: 'delete', text: del })
      if (ins) result.push({ type: 'insert', text: ins })
    }
    del = ''
    ins = ''
  }
  for (const op of ops) {
    if (op.type === 'equal') {
      flush()
      result.push(op)
    } else if (op.type === 'delete') {
      del += op.text
    } else {
      ins += op.text
    }
  }
  flush()
  return mergeOps(result)
}

/**
 * The whitespace both strings share at the start or the end — or the shared
 * whitespace-and-punctuation when taking it would leave one side empty, so
 * that "TITLE[-; SUBTITLE.-]{+.+}" reads "TITLE[-; SUBTITLE-].".
 */
function commonAffix(a: string, b: string, side: 'start' | 'end'): string {
  const re = side === 'start' ? /^[\s\p{P}]*/u : /[\s\p{P}]*$/u
  const pa = a.match(re)?.[0] ?? ''
  const pb = b.match(re)?.[0] ?? ''
  let n = 0
  while (n < pa.length && n < pb.length) {
    const ca = side === 'start' ? pa[n] : pa[pa.length - 1 - n]
    const cb = side === 'start' ? pb[n] : pb[pb.length - 1 - n]
    if (ca !== cb) break
    n++
  }
  let shared = side === 'start' ? pa.slice(0, n) : pa.slice(pa.length - n)
  const emptiesOneSide = shared.length === a.length || shared.length === b.length
  if (!emptiesOneSide) {
    // Keep only the whitespace part nearest the run.
    shared = side === 'start' ? (shared.match(/^\s*/)?.[0] ?? '') : (shared.match(/\s*$/)?.[0] ?? '')
  }
  return shared
}

/**
 * Give every deletion/insertion run — unpaired clauses, or a paired clause
 * whose tail was rewritten — a second chance to share a long phrase
 * (anchorDiff).  A run may span shared delimiters ("…philosophy. He…"), so
 * a phrase split across one is still found.  Runs without an anchor are
 * left as they are.
 */
function refineRuns(ops: DiffOp[]): DiffOp[] {
  const result: DiffOp[] = []
  let i = 0
  while (i < ops.length) {
    if (ops[i].type === 'equal') {
      result.push(ops[i])
      i++
      continue
    }
    // Collect the run: non-equal ops, plus delimiter-only equals followed by more of them.
    let j = i
    let del = ''
    let ins = ''
    while (j < ops.length) {
      const op = ops[j]
      if (op.type === 'equal') {
        if (!isDelimiter(op) || !ops[j + 1] || ops[j + 1].type === 'equal') break
        del += op.text
        ins += op.text
      } else if (op.type === 'delete') {
        del += op.text
      } else {
        ins += op.text
      }
      j++
    }
    const refined = del && ins ? anchorDiff(del, ins) : null
    if (refined) result.push(...normalizeRuns(refined))
    else result.push(...ops.slice(i, j))
    i = j
  }
  return mergeOps(result)
}

/**
 * Compute the diff between a 1818 row text and its 1831 counterpart.
 *
 * Aligns the clauses, diffs each paired step word by word, gathers the
 * unpaired clauses between paired steps per side, then hands the stream to
 * normalizeRuns (order and shared affixes) and refineRuns (anchors inside
 * runs).
 */
export function computeDiff(textA: string, textB: string): DiffOp[] {
  if (textA === textB) return [{ type: 'equal', text: textA }]

  const A = splitClauses(textA)
  const B = splitClauses(textB)
  const ops: DiffOp[] = []

  // Unpaired clauses between two paired steps, gathered per side.  They are
  // emitted as one deletion and one insertion; refineRuns then looks for
  // phrases they still share.
  let pendingDelete = ''
  let pendingInsert = ''
  const flush = () => {
    if (pendingDelete) ops.push({ type: 'delete', text: pendingDelete })
    if (pendingInsert) ops.push({ type: 'insert', text: pendingInsert })
    pendingDelete = ''
    pendingInsert = ''
  }

  let i = 0
  let j = 0
  for (const step of alignClauses(A, B)) {
    const a = A.slice(i, i + step.a).join('')
    const b = B.slice(j, j + step.b).join('')
    i += step.a
    j += step.b
    if (step.a > 0 && step.b > 0) {
      flush()
      ops.push(...wordDiff(a, b))
    } else if (step.a > 0) {
      pendingDelete += a
    } else {
      pendingInsert += b
    }
  }
  flush()

  return refineRuns(normalizeRuns(ops))
}

/**
 * Compute diffs for all relevant edition pairs of a row, given each
 * edition's row text (its paragraphs joined by PARAGRAPH_BREAK).
 * Returns a record keyed by "editionA_editionB".
 */
export function computePairDiffs(
  texts: Partial<Record<string, string | undefined>>,
): Record<string, DiffOp[]> {
  const editions = Object.keys(texts).filter((e) => texts[e] !== undefined)
  const result: Record<string, DiffOp[]> = {}

  for (let i = 0; i < editions.length; i++) {
    for (let j = i + 1; j < editions.length; j++) {
      const a = editions[i]
      const b = editions[j]
      result[`${a}_${b}`] = computeDiff(texts[a]!, texts[b]!)
    }
  }

  return result
}
