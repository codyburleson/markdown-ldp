/**
 * The parser's output vocabulary — a *raw* AST.
 *
 * Deliberately unresolved: nothing here is an IRI, and no predicate has been
 * matched to a predicate-note. Link resolution and IRI derivation are separate
 * steps that happen later (`spec/02` §3.5), and predicate resolution is a
 * single function applied by the mapping engine (`spec/02` §5.10). The parser's
 * only job is to say *what was written, and exactly where*.
 */

/**
 * Source location. Per `spec/02` §8: `line` is 1-indexed, `colStart`/`colEnd`
 * are 0-indexed **character** offsets into the line (not bytes), and `colEnd`
 * is exclusive. The two bases differ deliberately — `file:line:col` output is
 * read by humans, who count lines from 1.
 */
export interface Span {
  line: number
  colStart: number
  colEnd: number
}

/** The authoring construct a statement came from (`spec/02` §8). */
export type Form =
  | 'frontmatter'
  | 'inline-field'
  | 'statement'
  | 'three-link'
  | 'triple-block'
  | 'annotation'

/** `[[target#fragment|alias]]` — `spec/01` §4.1.2. */
export interface WikiLinkRef {
  kind: 'wikilink'
  /** Link text before `#` and `|`. Resolution to a note happens later. */
  target: string
  /** Heading portion after `#`, if any (`spec/02` §3.6). */
  fragment?: string
  /** Display text after `|`. Never affects identity (`spec/02` §3.5). */
  alias?: string
  span: Span
}

/** `[label](target)` — external IRI or vault path (`spec/01` §4.1.2). */
export interface MarkdownLinkRef {
  kind: 'mdlink'
  label: string
  target: string
  span: Span
}

/** A bare or quoted scalar. Datatype inference happens later (`spec/02` §7.3). */
export interface LiteralValue {
  kind: 'literal'
  /** Lexical form as authored, with surrounding quotes removed. */
  text: string
  /** Whether it was written quoted — `spec/02` §7.4 comma-splitting depends on it. */
  quoted: boolean
  span: Span
}

export type RawObject = WikiLinkRef | MarkdownLinkRef | LiteralValue
/** Subjects are always resources, never literals (`spec/01` §4.1.2). */
export type RawSubject = WikiLinkRef | MarkdownLinkRef

/** How a predicate was written. Affects nothing semantically — all forms
 *  resolve through one function (`spec/02` §5.10) — but provenance keeps it. */
export type PredicateSyntax =
  | 'fenced' // ((developed))
  | 'field-key' // developed:: …
  | 'wikilink' // the middle link of the three-link form
  | 'frontmatter-key' // developed: …

export interface RawPredicate {
  /** The authored token, preserved verbatim for display (`spec/02` §5.11). */
  token: string
  syntax: PredicateSyntax
  span: Span
}

/** One `key:: value` pair inside a `~( … )` annotation (`spec/01` §4.2). */
export interface RawAnnotation {
  predicate: RawPredicate
  object: RawObject
  span: Span
}

export interface RawStatement {
  /** `null` means the implicit subject — this note (`spec/01` §4.1a). */
  subject: RawSubject | null
  predicate: RawPredicate
  object: RawObject
  /** RDF-star annotations from a trailing `~( … )` (`spec/02` §6.4). */
  annotations: RawAnnotation[]
  form: Form
  /** The whole statement, annotations excluded. */
  span: Span
}

/**
 * A problem found while parsing. Never fatal: `spec/02` §6.3 requires that a
 * partially valid file still yields its valid quads, and `spec/01` §6 requires
 * unknown vocabulary to be a nudge rather than an error.
 */
export interface ParseDiagnostic {
  severity: 'warning' | 'error'
  message: string
  span: Span
}

export interface ParsedDocument {
  /** Vault-relative path, as given. The parser never touches the filesystem. */
  path: string
  /** Frontmatter and inline fields both lower to statements about this note. */
  statements: RawStatement[]
  diagnostics: ParseDiagnostic[]
}
