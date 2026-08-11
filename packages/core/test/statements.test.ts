import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseLine } from '../src/parse/statements.ts'
import type { RawStatement } from '../src/types.ts'

const one = (text: string): RawStatement => {
  const { statements } = parseLine(text, 1)
  assert.equal(statements.length, 1, `expected exactly one statement from: ${text}`)
  return statements[0]!
}

const none = (text: string): void => {
  assert.deepEqual(parseLine(text, 1).statements, [], `expected nothing from: ${text}`)
}

/**
 * `spec/02` §6.2: all authoring forms lower identically. The v0.1 defect this
 * guards is subtle — the forms produced *different predicate IRIs* because the
 * three-link form's middle link went through link resolution. Here we can only
 * check the parser's half of that promise: every form must yield the same
 * predicate token, subject and object shape.
 */
describe('spec/02 §6.2 — the forms agree', () => {
  it('fenced, three-link and inline-field produce the same triple', () => {
    const fenced = one('[[Einstein]] ((developed)) [[Relativity]]')
    const positional = one('[[Einstein]] [[developed]] [[Relativity]]')

    for (const s of [fenced, positional]) {
      assert.equal(s.predicate.token, 'developed')
      assert.equal(s.subject?.kind === 'wikilink' && s.subject.target, 'Einstein')
      assert.equal(s.object.kind === 'wikilink' && s.object.target, 'Relativity')
    }

    const field = one('developed:: [[Relativity]]')
    assert.equal(field.predicate.token, 'developed')
    assert.equal(field.subject, null, 'inline field takes the implicit subject')
    assert.equal(field.object.kind === 'wikilink' && field.object.target, 'Relativity')
  })

  it('records which form it came from, for provenance', () => {
    assert.equal(one('[[A]] ((p)) [[B]]').form, 'statement')
    assert.equal(one('[[A]] [[p]] [[B]]').form, 'three-link')
    assert.equal(one('p:: [[B]]').form, 'inline-field')
  })
})

describe('implicit subject (spec/01 §4.1a)', () => {
  it('`((p)) [[O]]` means the current note', () => {
    const s = one('((influenced)) [[GPS]]')
    assert.equal(s.subject, null)
    assert.equal(s.predicate.token, 'influenced')
  })

  it('two links on their own line mean the current note', () => {
    const s = one('[[influenced]] [[GPS]]')
    assert.equal(s.subject, null)
    assert.equal(s.predicate.token, 'influenced')
    assert.equal(s.object.kind === 'wikilink' && s.object.target, 'GPS')
  })
})

/**
 * `spec/01` §4.1c restricts the positional form to a whole line with nothing
 * but links. Without that restriction it misfires on ordinary prose, which is
 * the single most damaging false positive available to this parser: it would
 * silently invent statements the author never wrote.
 */
describe('spec/01 §4.1c — positional form does not misfire on prose', () => {
  it('ignores links with prose between them', () => {
    none('See [[Einstein]] and also [[Bohr]] on [[Physics]]')
  })

  it('ignores a line with trailing prose', () => {
    none('[[Einstein]] [[developed]] [[Relativity]] — a good year')
  })

  it('ignores a line with leading prose', () => {
    none('Note: [[Einstein]] [[developed]] [[Relativity]]')
  })

  it('ignores four links', () => {
    none('[[A]] [[B]] [[C]] [[D]]')
  })

  it('ignores a lone link', () => {
    none('[[Einstein]]')
  })

  it('requires the middle token to be a wikilink, not an external link', () => {
    none('[[A]] [p](https://example.org/p) [[B]]')
  })
})

/**
 * Regression: running the demo over this project's own README minted a
 * statement out of a bullet documenting the syntax. Prose *about* the syntax
 * is prose — the same restraint spec/02 §6.5 applies to plain wikilinks.
 */
describe('inline code spans mint nothing', () => {
  it('ignores a field inside backticks', () => {
    none('- `field:: [[Physics]]` — a typed statement about this note')
  })

  it('ignores a fenced predicate inside backticks', () => {
    none('The `((developed))` token fences a predicate.')
  })

  it('ignores a positional statement inside backticks', () => {
    none('Write `[[A]] [[p]] [[B]]` for the shorthand.')
  })

  it('still parses a real statement on a line that also has code', () => {
    const s = one('author:: [[Einstein]] `not a field:: here`')
    assert.equal(s.predicate.token, 'author')
    assert.equal(s.object.kind === 'wikilink' && s.object.target, 'Einstein')
  })

  it('leaves an unmatched backtick alone', () => {
    const s = one('author:: [[Einstein]]')
    assert.equal(s.predicate.token, 'author')
    // A stray backtick must not swallow the rest of the line.
    const stray = one('author:: [[Einstein]] ` stray')
    assert.equal(stray.predicate.token, 'author')
  })

  it('keeps spans true to the source despite masking', () => {
    const { statements } = parseLine('`x` author:: [[Einstein]]', 8)
    assert.equal(statements[0]?.span.colStart, 4)
  })
})

describe('spec/01 §4.2 — `~( … )` statement metadata', () => {
  it('attaches annotations to the statement it follows', () => {
    const s = one(
      '[[Einstein]] ((developed)) [[Relativity]] ~(source:: [[Pais 1982]], confidence:: 0.95)',
    )
    assert.equal(s.annotations.length, 2)
    assert.equal(s.annotations[0]?.predicate.token, 'source')
    assert.equal(
      s.annotations[0]?.object.kind === 'wikilink' && s.annotations[0].object.target,
      'Pais 1982',
    )
    assert.equal(s.annotations[1]?.predicate.token, 'confidence')
    assert.equal(
      s.annotations[1]?.object.kind === 'literal' && s.annotations[1].object.text,
      '0.95',
    )
  })

  it('leaves an ordinary prose aside alone — the whole point of the `~`', () => {
    const s = one('((influenced)) [[GPS]]')
    assert.equal(s.annotations.length, 0)

    // A trailing plain parenthetical is prose, and must not become metadata.
    none('[[Einstein]] developed relativity (which was a good idea)')
  })

  it('does not treat the base statement as replaced', () => {
    const s = one('((influenced)) [[GPS]] ~(confidence:: 0.8)')
    assert.equal(s.predicate.token, 'influenced')
    assert.equal(s.object.kind === 'wikilink' && s.object.target, 'GPS')
    assert.equal(s.annotations.length, 1)
  })
})

describe('wikilink anatomy (spec/01 §4.1.2, spec/02 §3.6)', () => {
  it('separates target, fragment and alias', () => {
    const s = one('((about)) [[Einstein#Youth|young Al]]')
    const o = s.object
    assert.equal(o.kind, 'wikilink')
    if (o.kind !== 'wikilink') return
    assert.equal(o.target, 'Einstein')
    assert.equal(o.fragment, 'Youth')
    assert.equal(o.alias, 'young Al')
  })

  it('an alias never changes identity', () => {
    const plain = one('((about)) [[Einstein]]')
    const aliased = one('((about)) [[Einstein|Al]]')
    assert.equal(
      plain.object.kind === 'wikilink' && plain.object.target,
      aliased.object.kind === 'wikilink' && aliased.object.target,
    )
  })
})

describe('multi-valued inline fields', () => {
  it('yields one statement per object', () => {
    const { statements } = parseLine('field:: [[A]], [[B]]', 1)
    assert.equal(statements.length, 2)
    assert.equal(statements[0]?.predicate.token, 'field')
    assert.equal(statements[1]?.predicate.token, 'field')
  })

  it('works inside a list bullet', () => {
    const { statements } = parseLine('- field:: [[A]]', 1)
    assert.equal(statements.length, 1)
    assert.equal(statements[0]?.predicate.token, 'field')
  })
})

describe('spans (spec/02 §8)', () => {
  it('are 1-indexed lines and 0-indexed exclusive-end columns', () => {
    // `author:: [[Einstein]]` is 21 characters — the spec/02 §11 worked example.
    const { statements } = parseLine('author:: [[Einstein]]', 8)
    const s = statements[0]!
    assert.equal(s.span.line, 8)
    assert.equal(s.span.colStart, 0)
    assert.equal(s.span.colEnd, 21)
  })
})
