/**
 * The reference vault, parsed end to end.
 *
 * Where the other suites pin individual spec rules against inline strings,
 * this one runs the parser over a corpus of real Markdown documents. The two
 * find different things: the rule-level tests all passed while the parser was
 * happily minting statements out of inline code in prose, because no spec
 * sentence anticipated documents that *discuss* the syntax. Real inputs did.
 */

import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { loadCleanNotes, loadEdgeCases, loadNote, loadVault } from '@markdown-ldp/fixtures'

import { parseDocument } from '../src/index.ts'
import { renderVault } from './support/render.ts'

const GOLDEN = fileURLToPath(new URL('./__golden__/parse-vault.txt', import.meta.url))

describe('the reference vault', () => {
  it('parses every note against the golden file', () => {
    const actual = renderVault(loadVault().map((n) => parseDocument(n.path, n.source)))

    if (process.env['UPDATE_GOLDEN']) {
      writeFileSync(GOLDEN, actual)
      return
    }

    const expected = readFileSync(GOLDEN, 'utf8')
    assert.equal(
      actual,
      expected,
      'Vault parse output changed.\n' +
        'If the change is intended, regenerate and READ THE DIFF:\n' +
        '  yarn workspace @markdown-ldp/core run golden\n',
    )
  })

  /**
   * Content notes are ordinary Markdown by design. A diagnostic here means the
   * parser rejects something an author may reasonably write.
   */
  it('parses the content notes without diagnostics', () => {
    for (const note of loadCleanNotes()) {
      const doc = parseDocument(note.path, note.source)
      assert.deepEqual(doc.diagnostics, [], `unexpected diagnostics in ${note.path}`)
    }
  })

  it('has edge cases that actually exercise something', () => {
    const edge = loadEdgeCases()
    assert.ok(edge.length >= 8, 'the edge-case corpus should not quietly shrink')

    const withDiagnostics = edge.filter(
      (n) => parseDocument(n.path, n.source).diagnostics.length > 0,
    )
    assert.ok(
      withDiagnostics.length > 0,
      'no edge case produces a diagnostic — the corpus has stopped testing failure',
    )
  })
})

describe('what the vault pins down', () => {
  it('`notes/Relativity.md` is still the spec/02 §11 example', () => {
    const note = loadNote('notes/Relativity.md')
    assert.equal(
      note.source,
      `---
type: [[Work]]
year: 1915
tags: [physics]
---
The theory of relativity.

author:: [[Einstein]]

((influenced)) [[GPS]] ~(confidence:: 0.8)
`,
      'This file is the spec/02 §11 worked example byte for byte. If the spec ' +
        'changed, update both together; do not edit it to make a test pass.',
    )
  })

  it('a note that only discusses the syntax mints nothing but its one real statement', () => {
    const note = loadNote('edge-cases/prose-about-syntax.md')
    const doc = parseDocument(note.path, note.source)

    assert.deepEqual(
      doc.statements.map((s) => s.predicate.token),
      ['type', 'supports'],
      'inline code and fenced blocks are prose about the syntax, not statements',
    )
  })

  it('unclosed frontmatter is an error and yields nothing from the block', () => {
    const note = loadNote('edge-cases/unclosed-frontmatter.md')
    const doc = parseDocument(note.path, note.source)

    assert.equal(doc.diagnostics.length, 1)
    assert.equal(doc.diagnostics[0]?.severity, 'error')
    // The body after the malformed block is still ordinary Markdown, so its
    // inline field is real — spec/02 §6.3, partial validity.
    assert.deepEqual(
      doc.statements.map((s) => s.predicate.token),
      ['developed'],
    )
  })

  it('a broken triple-block clause does not cost the file its valid ones', () => {
    const note = loadNote('edge-cases/triple-blocks.md')
    const doc = parseDocument(note.path, note.source)

    const fromBlocks = doc.statements.filter((s) => s.form === 'triple-block')
    assert.deepEqual(
      fromBlocks.map((s) => s.predicate.token),
      ['developed', 'born in', 'author', 'has part', 'has part'],
    )
    assert.equal(doc.diagnostics.length, 1)
    // …and the file keeps indexing after the bad block.
    assert.ok(doc.statements.some((s) => s.form === 'inline-field'))
  })

  it('applies §7.4 comma-splitting on real authored input', () => {
    const note = loadNote('edge-cases/comma-values.md')
    const doc = parseDocument(note.path, note.source)
    const objects = (token: string) =>
      doc.statements.filter((s) => s.predicate.token === token).map((s) => s.object)

    assert.equal(objects('field').length, 2, 'all links → split')
    assert.equal(objects('born in').length, 1, 'bare scalar with a comma → one literal')
    assert.equal(objects('alias').length, 2, 'all quoted → split')
    assert.equal(objects('note').length, 1, 'mixed → one literal')
  })

  it('keeps naked URLs out of the graph', () => {
    const note = loadNote('edge-cases/external-links.md')
    const doc = parseDocument(note.path, note.source)

    const mdlinks = doc.statements.filter((s) => s.object.kind === 'mdlink')
    assert.equal(mdlinks.length, 1, 'only the explicit [label](target) form is a term')
    assert.equal(
      mdlinks[0]?.object.kind === 'mdlink' && mdlinks[0].object.target,
      'https://en.wikipedia.org/wiki/Theory_of_relativity',
    )
  })
})
