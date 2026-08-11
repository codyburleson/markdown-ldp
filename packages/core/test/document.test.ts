import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseDocument } from '../src/parse/document.ts'
import type { RawStatement } from '../src/types.ts'

const byPredicate = (statements: RawStatement[], token: string): RawStatement[] =>
  statements.filter((s) => s.predicate.token === token)

/** The end-to-end example from `spec/02` §11, character for character. */
const RELATIVITY = `---
type: [[Work]]
year: 1915
tags: [physics]
---
The theory of relativity.

author:: [[Einstein]]

((influenced)) [[GPS]] ~(confidence:: 0.8)
`

describe('spec/02 §11 — the worked example', () => {
  const doc = parseDocument('notes/Relativity.md', RELATIVITY)

  it('parses without diagnostics', () => {
    assert.deepEqual(doc.diagnostics, [])
  })

  it('finds every authored statement', () => {
    assert.deepEqual(
      doc.statements.map((s) => s.predicate.token).sort(),
      ['author', 'influenced', 'tags', 'type', 'year'],
    )
  })

  it('gives `author::` the span the spec records: line 8, cols 0–21', () => {
    const [author] = byPredicate(doc.statements, 'author')
    assert.equal(author?.span.line, 8)
    assert.equal(author?.span.colStart, 0)
    assert.equal(author?.span.colEnd, 21)
  })

  it('takes the implicit subject for both body statements', () => {
    assert.equal(byPredicate(doc.statements, 'author')[0]?.subject, null)
    assert.equal(byPredicate(doc.statements, 'influenced')[0]?.subject, null)
  })

  it('carries the RDF-star annotation on `influenced`', () => {
    const [influenced] = byPredicate(doc.statements, 'influenced')
    assert.equal(influenced?.annotations.length, 1)
    assert.equal(influenced?.annotations[0]?.predicate.token, 'confidence')
  })

  /**
   * `tags` reaches the AST and is dropped later. The parser reports what was
   * written; `spec/02` §6.1's denylist is a *mapping* decision, and keeping the
   * two apart is what lets the denylist stay configurable.
   */
  it('reports `tags` rather than dropping it — filtering is a mapping concern', () => {
    assert.equal(byPredicate(doc.statements, 'tags').length, 1)
  })
})

describe('code fences', () => {
  it('ignores statements inside ordinary fenced code', () => {
    const doc = parseDocument('n.md', ['Text.', '', '```markdown', 'a:: [[B]]', '```'].join('\n'))
    assert.deepEqual(doc.statements, [])
  })

  it('still parses a ```triple block', () => {
    const source = [
      '```triple',
      '[[Einstein]]',
      '  ((developed)) [[Relativity]] ;',
      '  ((born in)) [[Ulm]] .',
      '```',
    ].join('\n')
    const doc = parseDocument('n.md', source)

    assert.deepEqual(doc.diagnostics, [])
    assert.equal(doc.statements.length, 2)
    for (const s of doc.statements) {
      assert.equal(s.form, 'triple-block')
      assert.equal(s.subject?.kind === 'wikilink' && s.subject.target, 'Einstein')
    }
    assert.deepEqual(
      doc.statements.map((s) => s.predicate.token),
      ['developed', 'born in'],
    )
  })

  it('keeps true line numbers after a fence', () => {
    const source = ['```', 'ignored', '```', 'a:: [[B]]'].join('\n')
    const doc = parseDocument('n.md', source)
    assert.equal(doc.statements[0]?.span.line, 4)
  })

  it('keeps true line numbers after frontmatter', () => {
    const doc = parseDocument('n.md', ['---', 'x: 1', '---', 'a:: [[B]]'].join('\n'))
    assert.equal(byPredicate(doc.statements, 'a')[0]?.span.line, 4)
  })
})

describe('frontmatter', () => {
  it('reads block sequences', () => {
    const doc = parseDocument('n.md', ['---', 'field:', '  - [[A]]', '  - [[B]]', '---'].join('\n'))
    const field = byPredicate(doc.statements, 'field')
    assert.equal(field.length, 2)
    assert.deepEqual(
      field.map((s) => (s.object.kind === 'wikilink' ? s.object.target : null)),
      ['A', 'B'],
    )
  })

  it('keeps CURIE keys intact', () => {
    const doc = parseDocument('n.md', ['---', 'dct:creator: [[Alice]]', '---'].join('\n'))
    assert.equal(doc.statements[0]?.predicate.token, 'dct:creator')
  })

  it('drops an empty `key:` with nothing under it', () => {
    const doc = parseDocument('n.md', ['---', 'empty:', 'x: 1', '---'].join('\n'))
    assert.deepEqual(
      doc.statements.map((s) => s.predicate.token),
      ['x'],
    )
  })

  it('reports unclosed frontmatter instead of guessing', () => {
    const doc = parseDocument('n.md', ['---', 'x: 1', 'no close'].join('\n'))
    assert.equal(doc.diagnostics[0]?.severity, 'error')
    assert.match(doc.diagnostics[0]?.message ?? '', /never closed/)
  })

  it('does not treat a `---` mid-document as frontmatter', () => {
    const doc = parseDocument('n.md', ['Text.', '---', 'x: 1', '---'].join('\n'))
    assert.deepEqual(doc.statements, [])
  })
})

/** `spec/02` §6.3: a parse error must not abort the rest of the file. */
describe('spec/02 §6.3 — partial validity', () => {
  it('yields the valid clauses of a broken triple block', () => {
    const source = [
      '```triple',
      '[[Einstein]]',
      '  ((developed)) [[Relativity]] ;',
      '  ((born in)) ;',
      '  ((won)) [[Nobel]] .',
      '```',
    ].join('\n')
    const doc = parseDocument('n.md', source)

    assert.equal(doc.statements.length, 2)
    assert.deepEqual(
      doc.statements.map((s) => s.predicate.token),
      ['developed', 'won'],
    )
    assert.equal(doc.diagnostics.length, 1)
    assert.equal(doc.diagnostics[0]?.severity, 'error')
    assert.equal(doc.diagnostics[0]?.span.line, 4)
  })

  it('keeps indexing the file after a bad block', () => {
    const source = ['```triple', '((orphan)) [[X]]', '```', 'a:: [[B]]'].join('\n')
    const doc = parseDocument('n.md', source)
    assert.equal(byPredicate(doc.statements, 'a').length, 1)
    assert.equal(doc.diagnostics.length, 1)
  })
})

describe('spec/02 §6.5 — what produces nothing', () => {
  it('plain wikilinks in prose mint nothing', () => {
    const doc = parseDocument('n.md', 'I read [[Einstein]] and liked [[Relativity]].')
    assert.deepEqual(doc.statements, [])
  })

  it('naked URLs mint nothing', () => {
    const doc = parseDocument('n.md', 'See https://example.org and <https://example.org>.')
    assert.deepEqual(doc.statements, [])
  })

  it('an empty document is not an error', () => {
    const doc = parseDocument('n.md', '')
    assert.deepEqual(doc.statements, [])
    assert.deepEqual(doc.diagnostics, [])
  })
})
