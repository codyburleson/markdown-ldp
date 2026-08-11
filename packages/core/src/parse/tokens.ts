/**
 * Token scanning — the shared vocabulary of the authoring surface.
 *
 * Everything above this file (frontmatter, inline fields, statements, triple
 * blocks) is composed from these scanners, which is what keeps `spec/02` §6.2's
 * promise that all authoring forms lower identically: they share the tokenizer.
 */

import type {
  LiteralValue,
  MarkdownLinkRef,
  RawObject,
  RawPredicate,
  Span,
  WikiLinkRef,
} from '../types.ts'

/** A token plus where scanning should resume. */
interface Scanned<T> {
  value: T
  /** Index just past the token, in the same coordinate space as the input. */
  end: number
}

const span = (line: number, colStart: number, colEnd: number): Span => ({
  line,
  colStart,
  colEnd,
})

/**
 * `[[target#fragment|alias]]` at `text[at]`, or null.
 *
 * `spec/02` §3.5: the link *text* never determines an IRI, so we keep target,
 * fragment and alias apart and let resolution decide. An empty target (`[[]]`)
 * is not a link.
 */
export function scanWikiLink(
  text: string,
  at: number,
  line: number,
  colOffset = 0,
): Scanned<WikiLinkRef> | null {
  if (!text.startsWith('[[', at)) return null
  const close = text.indexOf(']]', at + 2)
  if (close === -1) return null

  const inner = text.slice(at + 2, close)
  // An unescaped `[[` inside would mean we matched across a nested opener.
  if (inner.includes('[[')) return null

  // `|` binds last: `[[a#b|c]]` → target a, fragment b, alias c.
  const pipe = inner.indexOf('|')
  const beforeAlias = pipe === -1 ? inner : inner.slice(0, pipe)
  const alias = pipe === -1 ? undefined : inner.slice(pipe + 1).trim()

  const hash = beforeAlias.indexOf('#')
  const target = (hash === -1 ? beforeAlias : beforeAlias.slice(0, hash)).trim()
  const fragment = hash === -1 ? undefined : beforeAlias.slice(hash + 1).trim()

  if (target === '') return null

  const value: WikiLinkRef = {
    kind: 'wikilink',
    target,
    span: span(line, colOffset + at, colOffset + close + 2),
  }
  if (fragment !== undefined && fragment !== '') value.fragment = fragment
  if (alias !== undefined && alias !== '') value.alias = alias

  return { value, end: close + 2 }
}

/**
 * `[label](target)` at `text[at]`, or null.
 *
 * `spec/01` §4.1.2: only the explicit form is a term. Naked and autolinked URLs
 * stay prose, which is why nothing here scans bare `https://…`.
 */
export function scanMarkdownLink(
  text: string,
  at: number,
  line: number,
  colOffset = 0,
): Scanned<MarkdownLinkRef> | null {
  if (text[at] !== '[' || text.startsWith('[[', at)) return null

  const labelEnd = text.indexOf(']', at + 1)
  if (labelEnd === -1 || text[labelEnd + 1] !== '(') return null

  const targetEnd = text.indexOf(')', labelEnd + 2)
  if (targetEnd === -1) return null

  const target = text.slice(labelEnd + 2, targetEnd).trim()
  if (target === '') return null

  return {
    value: {
      kind: 'mdlink',
      label: text.slice(at + 1, labelEnd),
      target,
      span: span(line, colOffset + at, colOffset + targetEnd + 1),
    },
    end: targetEnd + 1,
  }
}

/**
 * `((predicate))` at `text[at]`, or null.
 *
 * The canonical, collision-safe predicate marker (`spec/01` §4.1b). The token
 * is preserved verbatim; normalization for *matching* happens in the mapping
 * engine (`spec/02` §5.11), which must not disturb what is displayed.
 */
export function scanFencedPredicate(
  text: string,
  at: number,
  line: number,
  colOffset = 0,
): Scanned<RawPredicate> | null {
  if (!text.startsWith('((', at)) return null
  const close = text.indexOf('))', at + 2)
  if (close === -1) return null

  const token = text.slice(at + 2, close).trim()
  if (token === '' || token.includes('((')) return null

  return {
    value: {
      token,
      syntax: 'fenced',
      span: span(line, colOffset + at, colOffset + close + 2),
    },
    end: close + 2,
  }
}

/**
 * A quoted literal (`"…"` or `'…'`) at `text[at]`, or null.
 *
 * Quoting is load-bearing beyond escaping: `spec/02` §7.4 splits a comma-joined
 * value only when *every* part is a link or a **quoted** literal.
 */
export function scanQuotedLiteral(
  text: string,
  at: number,
  line: number,
  colOffset = 0,
): Scanned<LiteralValue> | null {
  const quote = text[at]
  if (quote !== '"' && quote !== "'") return null

  let i = at + 1
  let out = ''
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\' && i + 1 < text.length) {
      out += text[i + 1]
      i += 2
      continue
    }
    if (ch === quote) {
      return {
        value: {
          kind: 'literal',
          text: out,
          quoted: true,
          span: span(line, colOffset + at, colOffset + i + 1),
        },
        end: i + 1,
      }
    }
    out += ch
    i += 1
  }
  return null // unterminated
}

/**
 * Scan one *resource-or-literal* term at `at`, skipping leading whitespace.
 * Returns null when nothing recognizable starts there.
 */
export function scanTerm(
  text: string,
  at: number,
  line: number,
  colOffset = 0,
): Scanned<RawObject> | null {
  let i = at
  while (i < text.length && /\s/.test(text[i] as string)) i += 1
  if (i >= text.length) return null

  return (
    scanWikiLink(text, i, line, colOffset) ??
    scanMarkdownLink(text, i, line, colOffset) ??
    scanQuotedLiteral(text, i, line, colOffset)
  )
}

/**
 * Every top-level term in `text`, in order — links and quoted literals only.
 *
 * Used by the whole-line statement forms, where adjacency *is* the syntax
 * (`spec/01` §4.1c), so we need to know both what the terms are and whether
 * anything else sits between them.
 */
export function scanAllTerms(
  text: string,
  line: number,
  colOffset = 0,
): RawObject[] {
  const found: RawObject[] = []
  let i = 0
  while (i < text.length) {
    const hit =
      scanWikiLink(text, i, line, colOffset) ??
      scanMarkdownLink(text, i, line, colOffset) ??
      scanQuotedLiteral(text, i, line, colOffset)
    if (hit) {
      found.push(hit.value)
      i = hit.end
    } else {
      i += 1
    }
  }
  return found
}

/** An unquoted scalar becomes a literal verbatim; datatypes come later. */
export function bareLiteral(
  text: string,
  line: number,
  colStart: number,
): LiteralValue {
  return {
    kind: 'literal',
    text,
    quoted: false,
    span: span(line, colStart, colStart + text.length),
  }
}
