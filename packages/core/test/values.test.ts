import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseFieldValue } from '../src/parse/values.ts'

/**
 * The worked table in `spec/02` §7.4, verbatim. This is the rule most likely
 * to be "simplified" by a later refactor into plain comma-splitting, which
 * would quietly corrupt every `born in:: Ulm, Germany`.
 */
describe('spec/02 §7.4 — comma-splitting is all-or-nothing', () => {
  const split = (raw: string) => parseFieldValue(raw, 1, 0, { commaSplit: true })

  it('splits when every part is a link', () => {
    const values = split('[[A]], [[B]]')
    assert.equal(values.length, 2)
    assert.deepEqual(
      values.map((v) => (v.kind === 'wikilink' ? v.target : null)),
      ['A', 'B'],
    )
  })

  it('does NOT split a bare scalar containing a comma', () => {
    const values = split('Ulm, Germany')
    assert.equal(values.length, 1)
    assert.equal(values[0]?.kind, 'literal')
    assert.equal(values[0]?.kind === 'literal' && values[0].text, 'Ulm, Germany')
  })

  it('splits when every part is a quoted literal', () => {
    const values = split('"Al", "Bert"')
    assert.equal(values.length, 2)
    assert.deepEqual(
      values.map((v) => (v.kind === 'literal' ? v.text : null)),
      ['Al', 'Bert'],
    )
  })

  it('does NOT split mixed content', () => {
    const values = split('[[A]], and also B')
    assert.equal(values.length, 1)
    assert.equal(values[0]?.kind, 'literal')
    assert.equal(
      values[0]?.kind === 'literal' && values[0].text,
      '[[A]], and also B',
    )
  })

  it('leaves a comma inside a link alone', () => {
    const values = split('[[Smith, John]]')
    assert.equal(values.length, 1)
    assert.equal(values[0]?.kind === 'wikilink' && values[0].target, 'Smith, John')
  })

  it('frontmatter scalars never comma-split', () => {
    const values = parseFieldValue('Ulm, Germany', 1, 0, { commaSplit: false })
    assert.equal(values.length, 1)
  })
})

describe('YAML flow sequences', () => {
  it('splits `[a, b]`', () => {
    const values = parseFieldValue('[physics, math]', 1, 0, { commaSplit: false })
    assert.equal(values.length, 2)
  })

  /**
   * The trap this parser exists to avoid: real YAML reads `type: [[Person]]`
   * as a sequence containing a sequence. Every Obsidian author means a
   * wikilink, and `spec/01` §3.1 tells us to read the *string form*.
   */
  it('reads `[[Person]]` as a wikilink, not a nested sequence', () => {
    const values = parseFieldValue('[[Person]]', 1, 0, { commaSplit: false })
    assert.equal(values.length, 1)
    assert.equal(values[0]?.kind, 'wikilink')
    assert.equal(values[0]?.kind === 'wikilink' && values[0].target, 'Person')
  })
})

describe('spans', () => {
  it('point at the value, not the whole line', () => {
    // `born:: 1879` — value starts at column 7
    const values = parseFieldValue(' 1879', 3, 6, { commaSplit: true })
    assert.deepEqual(values[0]?.span, { line: 3, colStart: 7, colEnd: 11 })
  })
})
