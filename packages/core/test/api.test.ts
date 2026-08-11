/**
 * The public API, and what it hands back.
 *
 * Every other test file reaches into `src/parse/*` to pin a specific rule from
 * the specs. This one goes through the package entry point only, and asserts
 * the **complete** returned object rather than picking at fields — so reading
 * this file tells you exactly what `parseDocument` returns, in full, with
 * nothing elided.
 *
 * Run it live with:  yarn workspace @markdown-ldp/core run demo
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import * as core from '../src/index.ts'
import { parseDocument } from '../src/index.ts'

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

describe('parseDocument — the whole returned object', () => {
  it('is exactly this', () => {
    assert.deepEqual(parseDocument('notes/Relativity.md', RELATIVITY), {
      path: 'notes/Relativity.md',
      frontmatterMaps: [],
      diagnostics: [],
      statements: [
        {
          // `type: [[Work]]`
          subject: null, // null = the implicit subject, i.e. this note
          predicate: {
            token: 'type',
            syntax: 'frontmatter-key',
            span: { line: 2, colStart: 0, colEnd: 4 },
          },
          object: {
            kind: 'wikilink',
            target: 'Work', // link *text*, not an IRI — resolution comes later
            span: { line: 2, colStart: 6, colEnd: 14 },
          },
          annotations: [],
          form: 'frontmatter',
          span: { line: 2, colStart: 0, colEnd: 14 },
        },
        {
          // `year: 1915` — still a string; datatype inference is spec/02 §7.3,
          // and belongs to the mapping engine, not the parser
          subject: null,
          predicate: {
            token: 'year',
            syntax: 'frontmatter-key',
            span: { line: 3, colStart: 0, colEnd: 4 },
          },
          object: {
            kind: 'literal',
            text: '1915',
            quoted: false, // `quoted` drives the spec/02 §7.4 split rule
            span: { line: 3, colStart: 6, colEnd: 10 },
          },
          annotations: [],
          form: 'frontmatter',
          span: { line: 3, colStart: 0, colEnd: 10 },
        },
        {
          // `tags: [physics]` — present in the AST on purpose. It mints no quad,
          // but that is the mapping engine's denylist decision (spec/02 §6.1),
          // so the parser still reports what was written.
          subject: null,
          predicate: {
            token: 'tags',
            syntax: 'frontmatter-key',
            span: { line: 4, colStart: 0, colEnd: 4 },
          },
          object: {
            kind: 'literal',
            text: 'physics',
            quoted: false,
            span: { line: 4, colStart: 7, colEnd: 14 },
          },
          annotations: [],
          form: 'frontmatter',
          span: { line: 4, colStart: 0, colEnd: 15 },
        },
        {
          // `author:: [[Einstein]]` — the span spec/02 §11 records:
          // line 8, cols 0–21 (1-indexed line, 0-indexed exclusive-end cols)
          subject: null,
          predicate: {
            token: 'author',
            syntax: 'field-key',
            span: { line: 8, colStart: 0, colEnd: 6 },
          },
          object: {
            kind: 'wikilink',
            target: 'Einstein',
            span: { line: 8, colStart: 9, colEnd: 21 },
          },
          annotations: [],
          form: 'inline-field',
          span: { line: 8, colStart: 0, colEnd: 21 },
        },
        {
          // `((influenced)) [[GPS]] ~(confidence:: 0.8)`
          subject: null,
          predicate: {
            token: 'influenced',
            syntax: 'fenced',
            span: { line: 10, colStart: 0, colEnd: 14 },
          },
          object: {
            kind: 'wikilink',
            target: 'GPS',
            span: { line: 10, colStart: 15, colEnd: 22 },
          },
          // RDF-star: metadata about the statement, not about GPS (spec/02 §6.4)
          annotations: [
            {
              predicate: {
                token: 'confidence',
                syntax: 'field-key',
                span: { line: 10, colStart: 25, colEnd: 35 },
              },
              object: {
                kind: 'literal',
                text: '0.8',
                quoted: false,
                span: { line: 10, colStart: 38, colEnd: 41 },
              },
              span: { line: 10, colStart: 25, colEnd: 41 },
            },
          ],
          form: 'statement',
          // The statement's own span excludes its annotations — the base
          // statement is what gets cited (spec/02 §8).
          span: { line: 10, colStart: 0, colEnd: 22 },
        },
      ],
    })
  })

  it('omits `fragment` and `alias` rather than setting them undefined', () => {
    const [statement] = parseDocument('n.md', '((about)) [[Einstein#Youth|Al]]').statements
    assert.deepEqual(statement?.object, {
      kind: 'wikilink',
      target: 'Einstein',
      fragment: 'Youth',
      alias: 'Al',
      span: { line: 1, colStart: 10, colEnd: 31 },
    })

    const [plain] = parseDocument('n.md', '((about)) [[Einstein]]').statements
    assert.equal('fragment' in (plain?.object ?? {}), false)
    assert.equal('alias' in (plain?.object ?? {}), false)
  })
})

describe('parseDocument — behavioural guarantees', () => {
  it('never throws, and reports trouble as diagnostics', () => {
    const doc = parseDocument('n.md', '---\nx: 1\nnever closed')
    assert.deepEqual(doc.diagnostics, [
      {
        severity: 'error',
        message: 'Frontmatter opened with `---` but never closed; ignoring it.',
        span: { line: 1, colStart: 0, colEnd: 3 },
      },
    ])
  })

  it('is pure — same input, same output, no filesystem access', () => {
    const a = parseDocument('n.md', RELATIVITY)
    const b = parseDocument('n.md', RELATIVITY)
    assert.deepEqual(a, b)
  })

  it('takes the path as a label only, and never reads it', () => {
    const doc = parseDocument('does/not/exist.md', 'a:: [[B]]')
    assert.equal(doc.path, 'does/not/exist.md')
    assert.equal(doc.statements.length, 1)
  })

  it('returns empty results for an empty document', () => {
    assert.deepEqual(parseDocument('n.md', ''), {
      path: 'n.md',
      statements: [],
      frontmatterMaps: [],
      diagnostics: [],
    })
  })
})

describe('the export surface', () => {
  it('exports what callers are expected to use', () => {
    assert.deepEqual(Object.keys(core).sort(), [
      'parseDocument',
      'parseFieldValue',
      'parseFrontmatter',
      'parseLine',
      'parseTripleBlock',
      'scanAllTerms',
      'scanFencedPredicate',
      'scanMarkdownLink',
      'scanQuotedLiteral',
      'scanTerm',
      'scanWikiLink',
    ])
  })
})
