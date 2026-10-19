import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parseMarkdown, sectionsToParagraphs, ParsedSection } from '../scripts/parse'
import { alignAllChapters, AlignWarning, loadDiffUnits } from '../scripts/align'
import { computeDiff } from '../scripts/diff'
import { BookParagraph, Edition, EDITIONS, rowText } from '../lib/types'

/**
 * Whole-book invariants, run over the real editions in content/raw so that a
 * regression anywhere in the text or the alignment data is caught, not just
 * in a hand-picked sample.
 */

const ROOT = path.resolve(__dirname, '..')
const CONTENT = path.join(ROOT, 'content')

function loadBook() {
  const sectionsByEdition: Partial<Record<Edition, ParsedSection[]>> = {}
  const paragraphsByEdition: Partial<Record<Edition, BookParagraph[]>> = {}
  for (const edition of EDITIONS) {
    const raw = fs.readFileSync(path.join(CONTENT, 'raw', `${edition}.md`), 'utf-8')
    const sections = parseMarkdown(raw)
    sectionsByEdition[edition] = sections
    paragraphsByEdition[edition] = sectionsToParagraphs(sections, edition)
  }
  const warnings: AlignWarning[] = []
  const chapters = alignAllChapters(sectionsByEdition, paragraphsByEdition, CONTENT, warnings)
  return { sectionsByEdition, paragraphsByEdition, chapters, warnings }
}

const book = loadBook()

test('every alignment pin resolves and none is ignored', () => {
  assert.deepEqual(book.warnings, [])
})

test('every paragraph appears once per file, in reading order, and in exactly the files it belongs to', () => {
  const units = loadDiffUnits(CONTENT)
  for (const edition of EDITIONS) {
    // Sections absorbed into a diff unit appear in their own file and in the unit's.
    const absorbed = new Set(
      Object.entries(units).flatMap(([unit, u]) => (u[edition] ?? []).filter((s) => s !== unit)),
    )
    const files = new Map<string, number>()
    for (const [slug, groups] of book.chapters) {
      const paras = groups.flatMap((g) => g.paragraphs[edition] ?? [])
      const ids = new Set<string>()
      for (let i = 0; i < paras.length; i++) {
        assert.ok(!ids.has(paras[i].id), `${edition} ${slug}: ${paras[i].id} appears twice in one file`)
        ids.add(paras[i].id)
        const prev = paras[i - 1]
        if (prev && prev.chapter === paras[i].chapter) {
          assert.ok(paras[i].paragraphIndex > prev.paragraphIndex, `${edition} ${slug}: ${paras[i].id} follows ${prev.id}`)
        }
      }
      for (const id of ids) files.set(id, (files.get(id) ?? 0) + 1)
    }
    const editionAlignment = JSON.parse(fs.readFileSync(path.join(CONTENT, 'edition-alignment.json'), 'utf-8')) as Record<string, string>
    for (const p of book.paragraphsByEdition[edition]!) {
      const canonical = editionAlignment[p.chapter] ?? p.chapter
      const expected = absorbed.has(canonical) ? 2 : 1
      assert.equal(files.get(p.id) ?? 0, expected, `${p.id} should be in ${expected} file(s)`)
    }
  }
})

test('every later section of a diff unit is marked where it begins', () => {
  const units = loadDiffUnits(CONTENT)
  for (const [slug, perEdition] of Object.entries(units)) {
    const groups = book.chapters.get(slug)!
    for (const [edition, sections] of Object.entries(perEdition) as [Edition, string[]][]) {
      for (const section of sections.slice(1)) {
        const marked = groups.find((g) => g.sectionStart?.[edition]?.slug === section)
        assert.ok(marked, `unit ${slug}: ${edition} section ${section} has no sectionStart`)
        const id = marked.sectionStart![edition]!.paragraphId
        assert.ok(marked.paragraphs[edition]!.some((p) => p.id === id), 'sectionStart names a paragraph of its row')
      }
    }
  }
})

test('every paragraph opens and closes its italics; a literal asterisk is written \\*', () => {
  for (const edition of EDITIONS) {
    for (const p of book.paragraphsByEdition[edition]!) {
      const marks = p.text.match(/(?<!\\)\*/g) ?? []
      assert.equal(marks.length % 2, 0, `${p.id}: unpaired italic mark (escape a literal asterisk as \\*)`)
      assert.doesNotMatch(p.text, /\\(?!\*)/, `${p.id}: a backslash may only escape an asterisk`)
    }
  }
})

test('every paired row diff reproduces both row texts exactly', () => {
  let pairs = 0
  for (const [slug, groups] of book.chapters) {
    for (const g of groups) {
      const a = rowText(g, '1818')
      const b = rowText(g, '1831')
      if (a === undefined || b === undefined) continue
      pairs++
      const ops = computeDiff(a, b)
      const from1818 = ops.filter((o) => o.type !== 'insert').map((o) => o.text).join('')
      const from1831 = ops.filter((o) => o.type !== 'delete').map((o) => o.text).join('')
      assert.equal(from1818, a, `${slug} row ${g.paragraphIndex}: 1818 text altered by the diff`)
      assert.equal(from1831, b, `${slug} row ${g.paragraphIndex}: 1831 text altered by the diff`)
    }
  }
  assert.ok(pairs > 500, `expected hundreds of paired rows, saw ${pairs}`)
})
