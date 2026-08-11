/**
 * ` ```triple ` blocks — the bulk / power-user layer (`spec/01` §4.3).
 *
 * Turtle-flavored: `;` repeats the block's subject, `.` ends it. Per
 * `spec/02` §6.3 a parse error inside a block is reported with `(file, line)`
 * and MUST NOT abort the rest of the file — a partially valid block still
 * yields its valid statements.
 */

import type { ParseDiagnostic, RawStatement, RawSubject } from '../types.ts'
import { scanAllTerms, scanFencedPredicate, scanTerm } from './tokens.ts'

export interface BlockResult {
  statements: RawStatement[]
  diagnostics: ParseDiagnostic[]
}

const isResource = (t: { kind: string }): boolean =>
  t.kind === 'wikilink' || t.kind === 'mdlink'

/**
 * Parse the interior of one block.
 *
 * @param lines     the block's content lines, excluding the fences
 * @param firstLine 1-indexed line number of `lines[0]` in the source file
 */
export function parseTripleBlock(lines: string[], firstLine: number): BlockResult {
  const statements: RawStatement[] = []
  const diagnostics: ParseDiagnostic[] = []

  let subject: RawSubject | null = null

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] as string
    const line = firstLine + i
    const text = raw.replace(/[;.]\s*$/, '')
    if (text.trim() === '') continue

    const terminates = /\.\s*$/.test(raw)

    const open = text.indexOf('((')
    if (open === -1) {
      // A bare subject line: `[[Einstein]]` on its own, opening the block.
      const terms = scanAllTerms(text, line, 0)
      if (terms.length === 1 && isResource(terms[0]!)) {
        subject = terms[0] as RawSubject
      } else if (terms.length > 0) {
        diagnostics.push({
          severity: 'error',
          message:
            'Expected a subject or a `((predicate)) object` clause in a `triple` block.',
          span: { line, colStart: 0, colEnd: raw.length },
        })
      }
      if (terminates) subject = null
      continue
    }

    const fenced = scanFencedPredicate(text, open, line)
    if (!fenced) {
      diagnostics.push({
        severity: 'error',
        message: 'Unterminated `((` predicate in a `triple` block.',
        span: { line, colStart: open, colEnd: raw.length },
      })
      continue
    }

    // A clause may restate its subject, or inherit the block's.
    const before = text.slice(0, open)
    const leading = scanAllTerms(before, line, 0)
    if (leading.length > 1 || (leading[0] && !isResource(leading[0]))) {
      diagnostics.push({
        severity: 'error',
        message: 'A `triple` clause may name at most one subject.',
        span: { line, colStart: 0, colEnd: raw.length },
      })
      continue
    }
    if (leading[0]) subject = leading[0] as RawSubject

    if (!subject) {
      diagnostics.push({
        severity: 'error',
        message: 'Clause has no subject and no subject is in scope.',
        span: { line, colStart: 0, colEnd: raw.length },
      })
      if (terminates) subject = null
      continue
    }

    const object = scanTerm(text, fenced.end, line, 0)
    if (!object) {
      diagnostics.push({
        severity: 'error',
        message: 'Clause has a predicate but no object.',
        span: { line, colStart: 0, colEnd: raw.length },
      })
      if (terminates) subject = null
      continue
    }

    statements.push({
      subject,
      predicate: fenced.value,
      object: object.value,
      annotations: [],
      form: 'triple-block',
      span: {
        line,
        colStart: leading[0]?.span.colStart ?? fenced.value.span.colStart,
        colEnd: object.value.span.colEnd,
      },
    })

    if (terminates) subject = null
  }

  return { statements, diagnostics }
}
