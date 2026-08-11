/**
 * Document parsing — frontmatter, then the body line by line.
 *
 * Code fences are skipped except for ` ```triple `. That matters more than it
 * looks: these specs are full of Markdown examples inside fences, and a parser
 * that mints statements from documentation would index its own README.
 */

import type { ParseDiagnostic, ParsedDocument, RawStatement } from '../types.ts'
import { parseFrontmatter } from './frontmatter.ts'
import { parseLine } from './statements.ts'
import { parseTripleBlock } from './triple-blocks.ts'

/** Opening fence: three or more backticks or tildes, plus an optional info string. */
const FENCE = /^(\s*)(`{3,}|~{3,})\s*(\S*)/

export function parseDocument(path: string, source: string): ParsedDocument {
  const lines = source.split(/\r?\n/)
  const statements: RawStatement[] = []
  const diagnostics: ParseDiagnostic[] = []

  const front = parseFrontmatter(lines)
  statements.push(...front.statements)
  diagnostics.push(...front.diagnostics)

  let i = front.linesConsumed
  while (i < lines.length) {
    const raw = lines[i] as string
    const fence = FENCE.exec(raw)

    if (fence) {
      const marker = fence[2] as string
      const info = (fence[3] ?? '').toLowerCase()
      const closeAt = findFenceClose(lines, i + 1, marker[0] as string, marker.length)
      const contentEnd = closeAt === -1 ? lines.length : closeAt

      if (info === 'triple') {
        const block = parseTripleBlock(lines.slice(i + 1, contentEnd), i + 2)
        statements.push(...block.statements)
        diagnostics.push(...block.diagnostics)
        if (closeAt === -1) {
          diagnostics.push({
            severity: 'warning',
            message: 'Unclosed `triple` block; parsed to end of file.',
            span: { line: i + 1, colStart: 0, colEnd: raw.length },
          })
        }
      }

      i = contentEnd + 1
      continue
    }

    const result = parseLine(raw, i + 1)
    statements.push(...result.statements)
    diagnostics.push(...result.diagnostics)
    i += 1
  }

  return { path, statements, diagnostics }
}

/** Index of the closing fence, or -1. A closing fence is at least as long as
 *  the opener and carries no info string. */
function findFenceClose(
  lines: string[],
  from: number,
  char: string,
  minLength: number,
): number {
  for (let i = from; i < lines.length; i += 1) {
    const m = FENCE.exec(lines[i] as string)
    if (!m) continue
    const marker = m[2] as string
    if (marker[0] === char && marker.length >= minLength && (m[3] ?? '') === '') {
      return i
    }
  }
  return -1
}
