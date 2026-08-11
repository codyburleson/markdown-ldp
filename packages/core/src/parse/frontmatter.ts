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
 * Accepted limits (recorded, not discovered later): nested maps, multi-line
 * scalars (`|`, `>`), anchors, aliases and tags are not interpreted. Each is
 * reported as a diagnostic rather than silently mangled.
 */

import type { ParseDiagnostic, RawStatement, Span } from '../types.ts'
import { parseFieldValue } from './values.ts'

export interface FrontmatterResult {
  statements: RawStatement[]
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

/**
 * Read the frontmatter block, if the document opens with one.
 *
 * Returns statements whose subject is implicit — the note itself. Reserved-key
 * filtering is *not* done here: it is a mapping concern (`spec/02` §6.1), and
 * the parser's job is to report what was written.
 */
export function parseFrontmatter(lines: string[]): FrontmatterResult {
  const statements: RawStatement[] = []
  const diagnostics: ParseDiagnostic[] = []

  if (lines[0]?.trim() !== FENCE) {
    return { statements, diagnostics, linesConsumed: 0 }
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
    return { statements, diagnostics, linesConsumed: 0 }
  }

  for (let i = 1; i < close; i += 1) {
    const raw = lines[i] as string
    const lineNo = i + 1 // 1-indexed (spec/02 §8)
    const text = stripComment(raw)
    if (text.trim() === '') continue

    // A block-sequence item belonging to the key above it.
    if (/^\s*-\s/.test(text)) {
      const previous = statements.at(-1)
      if (!previous) {
        diagnostics.push({
          severity: 'warning',
          message: 'List item with no preceding key; ignored.',
          span: { line: lineNo, colStart: 0, colEnd: raw.length },
        })
        continue
      }
      const dash = text.indexOf('-')
      const valueText = text.slice(dash + 1)
      const objects = parseFieldValue(valueText, lineNo, dash + 1, {
        commaSplit: false,
      })
      for (const object of objects) {
        statements.push({
          subject: null,
          // Re-use the key, but this occurrence spans this line.
          predicate: { ...previous.predicate, span: { ...previous.predicate.span } },
          object,
          annotations: [],
          form: 'frontmatter',
          span: { line: lineNo, colStart: 0, colEnd: raw.length },
        })
      }
      continue
    }

    if (/^\s/.test(raw)) {
      diagnostics.push({
        severity: 'warning',
        message: 'Indented frontmatter (nested maps) is not interpreted.',
        span: { line: lineNo, colStart: 0, colEnd: raw.length },
      })
      continue
    }

    const colon = text.indexOf(':')
    if (colon === -1) {
      diagnostics.push({
        severity: 'warning',
        message: 'Frontmatter line is not a `key: value` pair; ignored.',
        span: { line: lineNo, colStart: 0, colEnd: raw.length },
      })
      continue
    }

    // A CURIE key (`dct:creator:`) keeps its colon — the *last* colon before
    // the value separates key from value (`spec/01` §3.1).
    let keyEnd = colon
    for (let c = colon; c < text.length; c += 1) {
      if (text[c] !== ':') continue
      const next = text[c + 1]
      if (next === undefined || next === ' ' || next === '\t') keyEnd = c
    }

    const key = text.slice(0, keyEnd).trim()
    if (key === '') {
      diagnostics.push({
        severity: 'warning',
        message: 'Frontmatter key is empty; ignored.',
        span: { line: lineNo, colStart: 0, colEnd: raw.length },
      })
      continue
    }

    const keySpan: Span = { line: lineNo, colStart: 0, colEnd: key.length }
    const valueText = text.slice(keyEnd + 1)

    const unsupported = UNSUPPORTED.find((u) => u.pattern.test(valueText.trim()))
    if (unsupported) {
      diagnostics.push({
        severity: 'warning',
        message: `YAML ${unsupported.what} are not interpreted; key \`${key}\` ignored.`,
        span: { line: lineNo, colStart: 0, colEnd: raw.length },
      })
      continue
    }

    const objects = parseFieldValue(valueText, lineNo, keyEnd + 1, {
      commaSplit: false,
    })

    if (objects.length === 0) {
      // `key:` with nothing after it — a block sequence may follow. Record a
      // placeholder so list items can find their key, then drop it if none come.
      statements.push({
        subject: null,
        predicate: { token: key, syntax: 'frontmatter-key', span: keySpan },
        object: { kind: 'literal', text: '', quoted: false, span: keySpan },
        annotations: [],
        form: 'frontmatter',
        span: { line: lineNo, colStart: 0, colEnd: raw.length },
      })
      continue
    }

    for (const object of objects) {
      statements.push({
        subject: null,
        predicate: { token: key, syntax: 'frontmatter-key', span: keySpan },
        object,
        annotations: [],
        form: 'frontmatter',
        span: { line: lineNo, colStart: 0, colEnd: raw.length },
      })
    }
  }

  // Drop the `key:` placeholders. They exist only so that block-sequence items
  // on following lines can find their key; an empty value is not an assertion.
  // A deliberately empty *quoted* value (`key: ""`) is a real literal and stays.
  const kept = statements.filter(
    (s) => !(s.object.kind === 'literal' && s.object.text === '' && !s.object.quoted),
  )

  return { statements: kept, diagnostics, linesConsumed: close + 1 }
}
