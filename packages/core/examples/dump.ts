/**
 * Parse a Markdown file and print what `parseDocument` returns.
 *
 *   yarn workspace @markdown-ldp/core run demo              # built-in sample
 *   yarn workspace @markdown-ldp/core run demo path/to.md   # any file
 *   yarn workspace @markdown-ldp/core run demo path/to.md --json
 *
 * Without `--json` it prints a table; the AST is verbose enough that the
 * shape gets lost in its own punctuation on a first read.
 */

import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

import { parseDocument } from '../src/index.ts'
import type { RawObject } from '../src/types.ts'

const SAMPLE = `---
type: [[Work]]
year: 1915
tags: [physics]
---
The theory of relativity.

author:: [[Einstein]]

((influenced)) [[GPS]] ~(confidence:: 0.8)
`

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const file = args.find((a) => !a.startsWith('--'))

const path = file ? relative(process.cwd(), file) : 'notes/Relativity.md (sample)'
const source = file ? readFileSync(file, 'utf8') : SAMPLE

const doc = parseDocument(path, source)

if (asJson) {
  console.log(JSON.stringify(doc, null, 2))
  process.exit(0)
}

const show = (t: RawObject): string => {
  if (t.kind === 'wikilink') {
    return `[[${t.target}${t.fragment ? `#${t.fragment}` : ''}${t.alias ? `|${t.alias}` : ''}]]`
  }
  if (t.kind === 'mdlink') return `[${t.label}](${t.target})`
  return t.quoted ? `"${t.text}"` : `${t.text}`
}

console.log(`\n${doc.path} — ${doc.statements.length} statement(s)\n`)

for (const s of doc.statements) {
  const subject = s.subject ? show(s.subject) : '<this note>'
  const triple = `${subject} ${s.predicate.token} ${show(s.object)}`
  const at = `${s.span.line}:${s.span.colStart}-${s.span.colEnd}`
  console.log(`  ${triple.padEnd(48)} ${s.form.padEnd(13)} ${at}`)

  for (const a of s.annotations) {
    console.log(`  ${''.padEnd(48)} └ ~( ${a.predicate.token}: ${show(a.object)} )`)
  }
}

if (doc.diagnostics.length > 0) {
  console.log('\ndiagnostics:')
  for (const d of doc.diagnostics) {
    console.log(`  ${d.severity}: ${d.message} (line ${d.span.line})`)
  }
}

console.log(
  '\nNothing here is resolved: targets are link text, not IRIs, and `1915` is' +
    '\nstill a string. IRI derivation, predicate resolution and datatype' +
    '\ninference belong to the mapping engine (spec/02 §3.5, §5.10, §7.3).\n',
)
