/**
 * Layer B — statements (`spec/01` §4).
 *
 * **M1 only** (`spec/01` §4.0): a statement occupies its own line. M2
 * (prose-embedded) and M3 (annotated in place) are later stages; the forms here
 * are stable across all three, so nothing in this file has to change when they
 * arrive.
 *
 * The four forms, all lowering identically (`spec/02` §6.2):
 *   `developed:: [[X]]`                 implicit subject — inline field
 *   `[[S]] ((developed)) [[O]]`         fenced predicate
 *   `[[S]] [[developed]] [[O]]`         three-link positional shorthand
 *   `((developed)) [[O]]`               implicit subject, fenced
 *   `[[developed]] [[O]]`               implicit subject, two-link
 */

import type {
  ParseDiagnostic,
  RawAnnotation,
  RawObject,
  RawPredicate,
  RawStatement,
  RawSubject,
  Span,
} from '../types.ts'
import {
  scanAllTerms,
  scanFencedPredicate,
  scanTerm,
} from './tokens.ts'
import { parseFieldValue } from './values.ts'

export interface LineParseResult {
  statements: RawStatement[]
  diagnostics: ParseDiagnostic[]
}

/**
 * Blank out inline code spans, preserving length so every column stays true.
 *
 * Prose *about* the syntax is still prose: `` `field:: [[Physics]]` `` in a
 * sentence is an example being discussed, not a statement being made. This is
 * the same restraint `spec/02` §6.5 applies to plain wikilinks — and without
 * it, running the indexer over this project's own README mints a statement out
 * of its documentation.
 */
function maskInlineCode(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    if (text[i] !== '`') {
      out += text[i]
      i += 1
      continue
    }

    let run = 0
    while (text[i + run] === '`') run += 1
    const fence = '`'.repeat(run)

    // A closing run must be exactly this long — ``a`b`` closes on the pair.
    let search = i + run
    let close = -1
    while (search < text.length) {
      const at = text.indexOf(fence, search)
      if (at === -1) break
      if (text[at + run] !== '`' && text[at - 1] !== '`') {
        close = at
        break
      }
      search = at + 1
    }

    if (close === -1) {
      out += text[i]
      i += 1
      continue
    }

    out += ' '.repeat(close + run - i)
    i = close + run
  }
  return out
}

const isResource = (t: RawObject): t is RawSubject =>
  t.kind === 'wikilink' || t.kind === 'mdlink'

/**
 * Split a trailing `~( … )` annotation off a line.
 *
 * `spec/01` §4.2: the leading `~` is the disambiguator, chosen so that an
 * ordinary prose aside `(like this)` is *never* parsed as metadata. Deciding
 * that token now is what lets M2/M3 arrive without changing the syntax.
 */
function splitAnnotation(text: string): { body: string; annotation: string | null; at: number } {
  const at = text.lastIndexOf('~(')
  if (at === -1) return { body: text, annotation: null, at: -1 }
  if (!text.trimEnd().endsWith(')')) return { body: text, annotation: null, at: -1 }

  const close = text.lastIndexOf(')')
  if (close < at) return { body: text, annotation: null, at: -1 }

  return {
    body: text.slice(0, at),
    annotation: text.slice(at + 2, close),
    at,
  }
}

/** Parse the `key:: value, key:: value` pairs inside a `~( … )`. */
function parseAnnotations(
  inner: string,
  line: number,
  colOffset: number,
): RawAnnotation[] {
  const out: RawAnnotation[] = []
  // Pairs are comma-separated, but a value may itself contain commas inside a
  // link or quotes, so split on the `::` boundaries instead of on commas.
  const parts = inner.split(/,(?=[^,]*::)/)
  let cursor = 0

  for (const part of parts) {
    const offset = colOffset + cursor
    cursor += part.length + 1

    const sep = part.indexOf('::')
    if (sep === -1) continue

    const key = part.slice(0, sep).trim()
    if (key === '') continue

    const keyStart = offset + (part.length - part.trimStart().length)
    const predicate: RawPredicate = {
      token: key,
      syntax: 'field-key',
      span: { line, colStart: keyStart, colEnd: keyStart + key.length },
    }

    const objects = parseFieldValue(part.slice(sep + 2), line, offset + sep + 2, {
      commaSplit: false,
    })
    for (const object of objects) {
      out.push({
        predicate,
        object,
        span: { line, colStart: offset, colEnd: offset + part.length },
      })
    }
  }
  return out
}

/**
 * Parse one body line.
 *
 * Order matters: an inline field is tried first because `developed:: [[X]]`
 * would otherwise be misread as a two-link statement once the `::` key happens
 * to contain a link.
 */
export function parseLine(rawText: string, line: number): LineParseResult {
  const diagnostics: ParseDiagnostic[] = []
  // Masking is length-preserving, so every span below stays true to the source.
  const text = maskInlineCode(rawText)
  const { body, annotation, at } = splitAnnotation(text)
  const annotations =
    annotation === null ? [] : parseAnnotations(annotation, line, at + 2)

  const statement =
    parseInlineField(body, line) ??
    parseFencedStatement(body, line) ??
    parsePositionalStatement(body, line)

  if (!statement) return { statements: [], diagnostics }

  if (annotations.length > 0 && statement.length > 0) {
    // `~( … )` binds to the statement it immediately follows (`spec/01` §4.2).
    // A line yields at most one statement in every form that can carry one, so
    // the binding is unambiguous.
    statement[statement.length - 1]!.annotations = annotations
  }

  return { statements: statement, diagnostics }
}

/** `developed:: [[X]]` — implicit subject, the current note (`spec/01` §4.1a). */
function parseInlineField(text: string, line: number): RawStatement[] | null {
  // Allow a leading list marker so fields work inside bullets.
  const listMatch = /^(\s*[-*+]\s+)?/.exec(text)
  const lead = listMatch?.[0]?.length ?? 0
  const rest = text.slice(lead)

  const sep = rest.indexOf('::')
  if (sep <= 0) return null

  const key = rest.slice(0, sep).trim()
  if (key === '' || key.includes('[[') || key.includes('((')) return null

  const keyStart = lead + (rest.length - rest.trimStart().length)
  const predicate: RawPredicate = {
    token: key,
    syntax: 'field-key',
    span: { line, colStart: keyStart, colEnd: keyStart + key.length },
  }

  const objects = parseFieldValue(rest.slice(sep + 2), line, lead + sep + 2, {
    commaSplit: true,
  })
  if (objects.length === 0) return null

  const span: Span = { line, colStart: keyStart, colEnd: text.trimEnd().length }
  return objects.map((object) => ({
    subject: null,
    predicate,
    object,
    annotations: [],
    form: 'inline-field' as const,
    span,
  }))
}

/** `[[S]] ((developed)) [[O]]` and `((developed)) [[O]]` (`spec/01` §4.1b). */
function parseFencedStatement(text: string, line: number): RawStatement[] | null {
  const open = text.indexOf('((')
  if (open === -1) return null

  const fenced = scanFencedPredicate(text, open, line)
  if (!fenced) return null

  // At most one `(( ))` per statement (`spec/01` §4.1) — a second is an author
  // error we decline to guess at rather than silently mis-parse.
  if (text.indexOf('((', fenced.end) !== -1) return null

  const before = text.slice(0, open)
  const subjectTerms = scanAllTerms(before, line, 0)
  if (subjectTerms.length > 1) return null

  const first = subjectTerms[0]
  if (first && !isResource(first)) return null

  // Nothing but whitespace may sit between the subject and the predicate; in
  // M1 the whole line is the statement.
  if (first && before.slice(first.span.colEnd).trim() !== '') return null
  if (!first && before.trim() !== '') return null

  const objectHit = scanTerm(text, fenced.end, line, 0)
  if (!objectHit) return null
  if (text.slice(objectHit.end).trim() !== '') return null

  return [
    {
      subject: first ?? null,
      predicate: fenced.value,
      object: objectHit.value,
      annotations: [],
      form: 'statement',
      span: {
        line,
        colStart: first ? first.span.colStart : fenced.value.span.colStart,
        colEnd: objectHit.value.span.colEnd,
      },
    },
  ]
}

/**
 * Three-link `[[S]] [[P]] [[O]]` and two-link `[[P]] [[O]]` (`spec/01` §4.1c).
 *
 * Restricted to a whole line with nothing but the links and whitespace, which
 * is what keeps the adjacency rule from misfiring on ordinary prose. The middle
 * link is the predicate — and per `spec/02` §3.5 it resolves through predicate
 * resolution, never through link resolution.
 */
function parsePositionalStatement(text: string, line: number): RawStatement[] | null {
  const trimmed = text.trim()
  if (trimmed === '') return null

  const terms = scanAllTerms(text, line, 0)
  if (terms.length !== 3 && terms.length !== 2) return null
  if (!terms.every(isResource)) return null

  // Only whitespace may separate them, and nothing may precede or follow.
  const first = terms[0]!
  const last = terms[terms.length - 1]!
  if (text.slice(0, first.span.colStart).trim() !== '') return null
  if (text.slice(last.span.colEnd).trim() !== '') return null
  for (let i = 1; i < terms.length; i += 1) {
    const gap = text.slice(terms[i - 1]!.span.colEnd, terms[i]!.span.colStart)
    if (gap.trim() !== '') return null
  }

  const [a, b, c] = terms as RawSubject[]
  const predicateRef = terms.length === 3 ? b! : a!
  if (predicateRef.kind !== 'wikilink') return null

  const predicate: RawPredicate = {
    token: predicateRef.target,
    syntax: 'wikilink',
    span: predicateRef.span,
  }

  return [
    {
      subject: terms.length === 3 ? a! : null,
      predicate,
      object: terms.length === 3 ? c! : b!,
      annotations: [],
      form: 'three-link',
      span: { line, colStart: first.span.colStart, colEnd: last.span.colEnd },
    },
  ]
}
