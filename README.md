# markdown-ldp

Turn a Markdown knowledge base (starting with an Obsidian vault) into a real,
typed, provenance-bearing **knowledge graph** — moving authors away from dumb
`a → b` links toward formal **subject–predicate–object** statements with defined
meaning, so that **AI can genuinely reason over a vault**.

Built around the **W3C Linked Data Platform (LDP)** model as a means to a
principled read/write resource design — the end is a trustworthy, queryable,
AI-legible graph.

> **Status: design phase.** No code yet — we're writing the specifications
> first. See the plan and specs below.

## Read first

- **[PLAN.md](PLAN.md)** — roadmap, phases, the spec-review gate, decision log.
- **[spec/00-vision.md](spec/00-vision.md)** — anchor: why, what, architecture,
  the three faces.
- **[spec/01-triple-authoring-syntax.md](spec/01-triple-authoring-syntax.md)** —
  how humans write triples in Markdown.

## The idea in one screen

- **Each note is a subject/object** *and* a **named graph** (named by its IRI).
  The vault is the **RDF dataset** and IRI base.
- **Predicates carry the formal semantics.** They — and classes — live in the
  vault as notes; templates are class constructors.
- Authoring: frontmatter + `key:: value` fields, inline
  `[[Subject]] ((predicate)) [[Object]]` statements, and ` ```triple ` blocks,
  with RDF-star `(...)` for per-statement provenance.
- Markdown is the **source of truth**; the **quad store** is a derived,
  rebuildable index (backend still open — see `spec/adr/0001-quad-store-backend.md`).
- One reusable **TypeScript core**, three thin faces: an **LDP HTTP server**, an
  **Obsidian plugin**, and an **MCP server** (the AI-facing payoff).

## License

TBD.
