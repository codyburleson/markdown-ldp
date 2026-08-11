/**
 * A stable, readable rendering of a parsed document — the golden-file format.
 *
 * Two constraints shape it. It has to be **diffable**: a reviewer should see
 * from the diff alone what a change did, which rules out JSON's punctuation
 * noise. And it has to be **complete**: a format that hides a field cannot
 * catch a regression in it, so every field of every node appears.
 *
 * At Phase 2 exit this is replaced by canonical N-Quads (ADR-0003 §5), which
 * makes the golden format and the quad identity rule the same artifact. Until
 * quads exist, this is its stand-in.
 */

import type { ParsedDocument, RawObject, RawPredicate, Span } from '../../src/types.ts'

const at = (s: Span): string => `${s.line}:${s.colStart}-${s.colEnd}`

function term(t: RawObject): string {
  switch (t.kind) {
    case 'wikilink': {
      const fragment = t.fragment ? `#${t.fragment}` : ''
      const alias = t.alias ? `|${t.alias}` : ''
      return `[[${t.target}${fragment}${alias}]]`
    }
    case 'mdlink':
      return `[${t.label}](${t.target})`
    case 'literal':
      return t.quoted ? `"${t.text}"` : `<${t.text}>`
  }
}

const predicate = (p: RawPredicate): string => `${p.token} (${p.syntax} ${at(p.span)})`

/** One document. Ends with a newline so files concatenate cleanly. */
export function renderDocument(doc: ParsedDocument): string {
  const out: string[] = [`# ${doc.path}`]

  if (
    doc.statements.length === 0 &&
    doc.frontmatterMaps.length === 0 &&
    doc.diagnostics.length === 0
  ) {
    out.push('  (nothing)')
  }

  for (const s of doc.statements) {
    const subject = s.subject ? term(s.subject) : '<this note>'
    out.push(`  ${s.form}  ${at(s.span)}`)
    out.push(`    s  ${subject}${s.subject ? ` (${at(s.subject.span)})` : ''}`)
    out.push(`    p  ${predicate(s.predicate)}`)
    out.push(`    o  ${term(s.object)} (${at(s.object.span)})`)
    for (const a of s.annotations) {
      out.push(`    ~  ${predicate(a.predicate)} → ${term(a.object)} (${at(a.object.span)})`)
    }
  }

  for (const m of doc.frontmatterMaps) {
    out.push(`  map  ${m.key}  ${at(m.span)}`)
    for (const e of m.entries) {
      out.push(`    ${e.key} = ${e.value} (${at(e.span)})`)
    }
  }

  for (const d of doc.diagnostics) {
    out.push(`  ! ${d.severity}  ${at(d.span)}  ${d.message}`)
  }

  return `${out.join('\n')}\n`
}

/** The whole vault, in path order. */
export function renderVault(docs: ParsedDocument[]): string {
  return `${docs.map(renderDocument).join('\n')}`
}
