/**
 * @markdown-ldp/core — the semantic core.
 *
 * Phase 2 (`PLAN.md` §4): parser → AST is in place. Mapping engine, IRI
 * minting and the `QuadStore` port follow.
 */

export type {
  Form,
  FrontmatterMap,
  LiteralValue,
  MarkdownLinkRef,
  ParseDiagnostic,
  ParsedDocument,
  PredicateSyntax,
  RawAnnotation,
  RawObject,
  RawPredicate,
  RawStatement,
  RawSubject,
  Span,
  WikiLinkRef,
} from './types.ts'

export { parseDocument } from './parse/document.ts'
export { parseFrontmatter } from './parse/frontmatter.ts'
export { parseLine } from './parse/statements.ts'
export { parseTripleBlock } from './parse/triple-blocks.ts'
export { parseFieldValue } from './parse/values.ts'
export {
  scanAllTerms,
  scanFencedPredicate,
  scanMarkdownLink,
  scanQuotedLiteral,
  scanTerm,
  scanWikiLink,
} from './parse/tokens.ts'
