/**
 * Field values — the shared path for frontmatter and inline `::` fields.
 *
 * `spec/01` §3.1 requires **one** value path so `born: 1879` and `born:: 1879`
 * cannot diverge. The two callers differ in exactly one respect, and it is a
 * decision `spec/02` §7.4 makes explicitly: an inline `::` value may be
 * comma-split, a frontmatter *scalar* never is (YAML lists already split, by
 * YAML's own semantics).
 */

import type { RawObject } from '../types.ts'
import {
  bareLiteral,
  scanMarkdownLink,
  scanQuotedLiteral,
  scanWikiLink,
} from './tokens.ts'

/**
 * Split on commas that sit at nesting depth zero — outside `[[…]]`, `[…](…)`
 * and quotes. Returns the pieces with their offsets into `raw`.
 */
function splitTopLevel(raw: string): { text: string; offset: number }[] {
  const parts: { text: string; offset: number }[] = []
  let depthSquare = 0
  let depthParen = 0
  let quote: string | null = null
  let start = 0

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i] as string
    if (quote) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '[') depthSquare += 1
    else if (ch === ']') depthSquare = Math.max(0, depthSquare - 1)
    else if (ch === '(') depthParen += 1
    else if (ch === ')') depthParen = Math.max(0, depthParen - 1)
    else if (ch === ',' && depthSquare === 0 && depthParen === 0) {
      parts.push({ text: raw.slice(start, i), offset: start })
      start = i + 1
    }
  }
  parts.push({ text: raw.slice(start), offset: start })
  return parts
}

/** Re-anchor a piece's offset after trimming its leading whitespace. */
function trimmedOffset(text: string, offset: number): { text: string; offset: number } {
  const leading = text.length - text.trimStart().length
  return { text: text.trim(), offset: offset + leading }
}

/**
 * Parse one piece as a *single* term occupying the whole piece.
 * Returns null when the piece is anything else — mixed content, prose, a bare
 * scalar. That "null" is what drives the §7.4 all-or-nothing split rule.
 */
function asSoleTerm(
  text: string,
  line: number,
  colOffset: number,
): RawObject | null {
  const hit =
    scanWikiLink(text, 0, line, colOffset) ??
    scanMarkdownLink(text, 0, line, colOffset) ??
    scanQuotedLiteral(text, 0, line, colOffset)
  if (!hit) return null
  return hit.end === text.length ? hit.value : null
}

export interface ValueOptions {
  /**
   * Apply `spec/02` §7.4 comma-splitting. True for inline `::` fields, false
   * for frontmatter scalars.
   */
  commaSplit: boolean
}

/**
 * A field value → one or more objects.
 *
 * `spec/02` §7.4, worked:
 *   `[[A]], [[B]]`        → two quads
 *   `Ulm, Germany`        → **one** literal — a bare scalar with a comma is
 *                           ordinary prose and must survive intact
 *   `"Al", "Bert"`        → two literals
 *   `[[A]], and also B`   → **one** literal (mixed → no split)
 */
export function parseFieldValue(
  raw: string,
  line: number,
  colOffset: number,
  options: ValueOptions,
): RawObject[] {
  const trimmed = trimmedOffset(raw, colOffset)
  if (trimmed.text === '') return []

  const whole = asSoleTerm(trimmed.text, line, trimmed.offset)
  if (whole) return [whole]

  // A YAML flow sequence — `[a, b]`. Checked *after* the single-term test so
  // `[[A]]` is read as a wikilink rather than as a nested sequence. (YAML
  // itself would read `type: [[Person]]` as a sequence-in-a-sequence; we read
  // the string form instead, per `spec/01` §3.1.)
  if (trimmed.text.startsWith('[') && trimmed.text.endsWith(']') && !trimmed.text.startsWith('[[')) {
    const inner = trimmed.text.slice(1, -1)
    return splitTopLevel(inner).flatMap((piece) => {
      const p = trimmedOffset(piece.text, trimmed.offset + 1 + piece.offset)
      if (p.text === '') return []
      return (
        asSoleTerm(p.text, line, p.offset) ?? bareLiteral(p.text, line, p.offset)
      )
    })
  }

  if (options.commaSplit) {
    const pieces = splitTopLevel(trimmed.text)
    if (pieces.length > 1) {
      const terms = pieces.map((piece) => {
        const p = trimmedOffset(piece.text, trimmed.offset + piece.offset)
        return p.text === '' ? null : asSoleTerm(p.text, line, p.offset)
      })
      // All-or-nothing: one non-term piece and the whole value stays a literal.
      if (terms.every((t) => t !== null)) return terms as RawObject[]
    }
  }

  return [bareLiteral(trimmed.text, line, trimmed.offset)]
}
