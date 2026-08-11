/**
 * Frontmatter — Layer A (`spec/01` §3, `spec/02` §6.1).
 *
 * **This is a line-oriented reader over the value's *string form*, not a YAML
 * parser, and that is deliberate.** `spec/01` §3.1 requires one shared
 * inference path so `born: 1879` and `born:: 1879` cannot diverge, and it is
 * the *string* form both must agree on.
 *
 * A full YAML parser would actively get the common case wrong: in YAML,
 * `type: [[Person]]` is a flow sequence containing a flow sequence — the value
 * is `[["Person"]]`, not the wikilink every Obsidian author means. Reading the
 * string form and scanning it ourselves is both simpler and more faithful to
 * what was written.
 *
 * Three shapes are understood: scalars (`key: value`), block sequences (`key:`
 * then indented `- item` lines) and one level of nested map (`key:` then
 * indented `k: v` lines — the shape `spec/02` §4's prefix map requires).
 *
 * Accepted limits, reported as diagnostics rather than silently mangled:
 * maps nested more than one level, multi-line scalars (`|`, `>`), anchors,
 * aliases and explicit tags.
 */

import type {
  FrontmatterMap,
  ParseDiagnostic,
  RawStatement,
  Span,
} from '../types.ts'
import { parseFieldValue } from './values.ts'

export interface FrontmatterResult {
  statements: RawStatement[]
  maps: FrontmatterMap[]
  diagnostics: ParseDiagnostic[]
  /** Number of leading lines consumed, so the body keeps true line numbers. */
  linesConsumed: number
}

const FENCE = '---'

/** Strip a trailing ` # comment`. YAML needs whitespace before `#`, which is
 *  also what keeps a value like `C#` or a `#tag` intact. */
function stripComment(text: string): string {
  const at = text.search(/\s#/)
  return at === -1 ? text : text.slice(0, at)
}

const UNSUPPORTED = [
  { pattern: /^[|>]/, what: 'multi-line scalars' },
  { pattern: /^[&*]/, what: 'anchors and aliases' },
  { pattern: /^!!/, what: 'explicit tags' },
]

const indentOf = (text: string): number => text.length - text.trimStart().length

/**
 * Split `key: value`, honouring CURIE keys — the separator is the last colon
 * followed by whitespace or end-of-line, so `dct:creator: [[X]]` keeps its
 * prefix (`spec/01` §3.1).
 */
function splitKey(text: string): { key: string; valueAt: number } | null {
  const first = text.indexOf(':')
  if (first === -1) return null

  let keyEnd = first
  for (let c = first; c < text.length; c += 1) {
    if (text[c] !== ':') continue
    const next = text[c + 1]
    if (next === undefined || next === ' ' || next === '\t') keyEnd = c
  }
  return { key: text.slice(0, keyEnd).trim(), valueAt: keyEnd + 1 }
}

export function parseFrontmatter(lines: string[]): FrontmatterResult {
  const statements: RawStatement[] = []
  const maps: FrontmatterMap[] = []
  const diagnostics: ParseDiagnostic[] = []

  if (lines[0]?.trim() !== FENCE) {
    return { statements, maps, diagnostics, linesConsumed: 0 }
  }

  let close = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === FENCE) {
      close = i
      break
    }
  }
  if (close === -1) {
    diagnostics.push({
      severity: 'error',
      message: 'Frontmatter opened with `---` but never closed; ignoring it.',
      span: { line: 1, colStart: 0, colEnd: FENCE.length },
    })
    return { statements, maps, diagnostics, linesConsumed: 0 }
  }

  const warn = (message: string, line: number, raw: string): void => {
    diagnostics.push({
      severity: 'warning',
      message,
      span: { line, colStart: 0, colEnd: raw.length },
    })
  }

  let i = 1
  while (i < close) {
    const raw = lines[i] as string
    const lineNo = i + 1 // 1-indexed (spec/02 §8)
    const text = stripComment(raw)

    if (text.trim() === '') {
      i += 1
      continue
    }

    if (indentOf(text) > 0) {
      warn('Indented line with no key above it; ignored.', lineNo, raw)
      i += 1
      continue
    }

    const split = splitKey(text)
    if (!split || split.key === '') {
      warn('Frontmatter line is not a `key: value` pair; ignored.', lineNo, raw)
      i += 1
      continue
    }

    const { key, valueAt } = split
    const keySpan: Span = { line: lineNo, colStart: 0, colEnd: key.length }
    const valueText = text.slice(valueAt)

    const unsupported = UNSUPPORTED.find((u) => u.pattern.test(valueText.trim()))
    if (unsupported) {
      warn(
        `YAML ${unsupported.what} are not interpreted; key \`${key}\` ignored.`,
        lineNo,
        raw,
      )
      i += 1
      continue
    }

    // An inline value on the same line settles it — no block can follow.
    const inline = parseFieldValue(valueText, lineNo, valueAt, { commaSplit: false })
    if (inline.length > 0) {
      for (const object of inline) {
        statements.push({
          subject: null,
          predicate: { token: key, syntax: 'frontmatter-key', span: keySpan },
          object,
          annotations: [],
          form: 'frontmatter',
          span: { line: lineNo, colStart: 0, colEnd: raw.length },
        })
      }
      i += 1
      continue
    }

    // `key:` with nothing after it — gather the indented block beneath it.
    const blockStart = i + 1
    let end = blockStart
    while (end < close && (lines[end] as string).trim() !== '' && indentOf(lines[end] as string) > 0) {
      end += 1
    }

    if (end === blockStart) {
      // Nothing followed. An empty value is not an assertion.
      i += 1
      continue
    }

    const block = lines.slice(blockStart, end)
    const isSequence = /^\s*-\s/.test(block[0] as string)

    if (isSequence) {
      for (let b = 0; b < block.length; b += 1) {
        const itemRaw = block[b] as string
        const itemLine = blockStart + b + 1
        const item = stripComment(itemRaw)
        const dash = item.indexOf('-')
        if (dash === -1) {
          warn('Expected a `- item` in this list; ignored.', itemLine, itemRaw)
          continue
        }
        for (const object of parseFieldValue(item.slice(dash + 1), itemLine, dash + 1, {
          commaSplit: false,
        })) {
          statements.push({
            subject: null,
            predicate: { token: key, syntax: 'frontmatter-key', span: keySpan },
            object,
            annotations: [],
            form: 'frontmatter',
            span: { line: itemLine, colStart: 0, colEnd: itemRaw.length },
          })
        }
      }
      i = end
      continue
    }

    // A nested map — `spec/02` §4's prefix map. Captured as structure, not as
    // statements: flattening it would invent semantics nobody authored.
    const entries: FrontmatterMap['entries'] = []
    const baseIndent = indentOf(block[0] as string)

    for (let b = 0; b < block.length; b += 1) {
      const entryRaw = block[b] as string
      const entryLine = blockStart + b + 1
      const entryText = stripComment(entryRaw)

      if (indentOf(entryText) > baseIndent) {
        warn('Maps nested more than one level are not interpreted.', entryLine, entryRaw)
        continue
      }

      const entrySplit = splitKey(entryText.trim())
      if (!entrySplit || entrySplit.key === '') {
        warn('Expected a `key: value` pair in this map; ignored.', entryLine, entryRaw)
        continue
      }

      const value = entryText.trim().slice(entrySplit.valueAt).trim()
      entries.push({
        key: entrySplit.key,
        value,
        span: { line: entryLine, colStart: 0, colEnd: entryRaw.length },
      })
    }

    if (entries.length > 0) {
      maps.push({
        key,
        entries,
        span: { line: lineNo, colStart: 0, colEnd: raw.length },
      })
    }
    i = end
  }

  return { statements, maps, diagnostics, linesConsumed: close + 1 }
}
