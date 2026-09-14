import { ReactNode, createElement, Fragment } from 'react'
import { PARAGRAPH_BREAK, type DiffOp, type DiffOpType, type Edition } from './types'

/**
 * Converts *italic* markdown spans in a string to <em> elements.
 * Everything else is returned as plain text.
 */
export function renderText(text: string): ReactNode {
  const processed = text
  const parts = processed.split(/(\*[^*]+\*)/)
  if (parts.length === 1) return processed
  return createElement(
    Fragment,
    null,
    ...parts.map((part, i) => {
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return createElement('em', { key: i }, part.slice(1, -1))
      }
      return part || null
    }),
  )
}

/** A paragraph break inside a diffed row, and which edition(s) break there. */
export interface DiffBreak {
  type: DiffOpType
  /** Index of the paragraph boundary in each edition that breaks here (0 = between its 1st and 2nd paragraph). */
  boundary: Partial<Record<Edition, number>>
}

/** One paragraph's worth of rendered diff, preceded by the break that opened it (none for the first). */
export interface DiffBlock {
  breakBefore?: DiffBreak
  nodes: ReactNode[]
}

/**
 * Renders a list of diff ops as paragraph blocks, handling *italic* markdown
 * spans across op boundaries.  A PARAGRAPH_BREAK inside an op starts a new
 * block: in an insert op it is a break 1831 introduced, in a delete op one
 * 1818 had, in an equal op one both editions share.
 *
 * Two italic cursors (one per edition) are tracked independently. A `*` in an
 * `equal` op toggles both; a `*` in a `delete` op toggles only 1818; a `*` in
 * an `insert` op toggles only 1831. The `*` character is never rendered.
 *
 * When italic status differs between editions on an equal-op segment, the text
 * is emitted as a del/ins pair — consistent with how content changes are shown:
 *   - italic removed  → <del><em>word</em></del> <ins>word</ins>
 *   - italic added    → <del>word</del> <ins><em>word</em></ins>
 *
 * Whitespace-only edits (a space that became a paragraph break) are shown as
 * plain whitespace rather than an empty coloured box.
 */
export function renderDiffBlocks(ops: DiffOp[]): DiffBlock[] {
  let i1818 = false
  let i1831 = false
  const blocks: DiffBlock[] = [{ nodes: [] }]
  const boundary: Record<Edition, number> = { '1818': 0, '1831': 0 }
  let key = 0

  const DEL_CLS = 'bg-del-bg text-del-text rounded-sm px-0.5'
  const INS_CLS = 'no-underline bg-ins-bg text-ins-text rounded-sm px-0.5'

  const push = (node: ReactNode) => blocks[blocks.length - 1].nodes.push(node)

  for (const op of ops) {
    const pieces = op.text.split(PARAGRAPH_BREAK)
    for (let p = 0; p < pieces.length; p++) {
      if (p > 0) {
        const at: DiffBreak['boundary'] = {}
        if (op.type !== 'insert') at['1818'] = boundary['1818']++
        if (op.type !== 'delete') at['1831'] = boundary['1831']++
        blocks.push({ breakBefore: { type: op.type, boundary: at }, nodes: [] })
      }
      const piece = pieces[p]
      if (!piece) continue

      if (/^\s+$/.test(piece)) {
        push(<span key={key++}>{piece}</span>)
        continue
      }

      const parts = piece.split('*')

      for (let i = 0; i < parts.length; i++) {
        // Every split point represents a `*` we crossed — toggle italic state(s)
        if (i > 0) {
          if (op.type === 'equal')        { i1818 = !i1818; i1831 = !i1831 }
          else if (op.type === 'delete')  { i1818 = !i1818 }
          else                            { i1831 = !i1831 }
        }

        const text = parts[i]
        if (!text) continue

        if (op.type === 'equal') {
          if (i1818 && i1831) {
            // Italic in both — plain <em>
            push(<span key={key++}><em>{text}</em></span>)
          } else if (i1818 && !i1831) {
            // Italic removed in 1831 — del/ins pair
            push(<del key={key++} className={DEL_CLS} title="Italicised in 1818"><em>{text}</em></del>)
            push(<ins key={key++} className={INS_CLS} title="Plain in 1831">{text}</ins>)
          } else if (!i1818 && i1831) {
            // Italic added in 1831 — del/ins pair
            push(<del key={key++} className={DEL_CLS} title="Plain in 1818">{text}</del>)
            push(<ins key={key++} className={INS_CLS} title="Italicised in 1831"><em>{text}</em></ins>)
          } else {
            push(<span key={key++}>{text}</span>)
          }
        } else if (op.type === 'insert') {
          push(
            <ins key={key++} className={INS_CLS} title="Added in 1831">
              {i1831 ? <em>{text}</em> : text}
            </ins>,
          )
        } else {
          push(
            <del key={key++} className={DEL_CLS} title="Removed in 1831">
              {i1818 ? <em>{text}</em> : text}
            </del>,
          )
        }
      }
    }
  }

  return blocks
}

/** Renders diff ops that contain no paragraph break as a single run of nodes. */
export function renderDiffOps(ops: DiffOp[]): ReactNode {
  return <>{renderDiffBlocks(ops).flatMap((b) => b.nodes)}</>
}
