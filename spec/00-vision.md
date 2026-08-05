# Vision & Architecture (ANCHOR)

Status: **Living anchor doc.** Read this first. It states *why* the project
exists, *what* it is, and the *shape* of how it's built. Detailed normative
rules live in the numbered specs; decisions are logged here and in `PLAN.md`.

---

## 1. The problem

Personal knowledge bases — Obsidian vaults, folders of Markdown — are built on
**untyped links**. `[[Einstein]]` next to `[[Relativity]]` tells you the two
notes are *related*, but not *how*. The link `a → b` carries no meaning a machine
can act on. As vaults grow, this "pile of connected pages" resists real
reasoning: you can traverse links, but you can't ask *what kind* of relationship
connects two ideas, *who* asserted it, or *how confident* the author was.

At the same time, AI assistants are increasingly the thing consuming these
vaults — and they're forced to fall back on full-text search and fuzzy
inference, because there is no structured graph to reason over.

## 2. What we're building

**my-ldp turns a Markdown knowledge base into a real, typed, provenance-bearing
knowledge graph** — while keeping the Markdown human-first and portable.

Authors keep writing notes, but gain the ability to write **formal
subject–predicate–object statements** with defined predicates, typed entities,
and per-statement provenance. The system projects those statements into an
**RDF quad store**, exposes them through standards (**W3C Linked Data
Platform**) and through an **AI-native interface (MCP)**, and can validate them
against a schema that itself lives in the vault as notes.

The guiding purpose:

> **Move people from dumb `a → b` links to semantically meaningful links, so
> that AI can genuinely make sense of a vault and assist the user.**

LDP conformance is a *means* — a principled read/write resource model and
interop credibility. The *end* is a trustworthy, queryable, AI-legible graph.

### North-star scenario
> *"What did Einstein develop, with what evidence, and how does it connect to
> notes I wrote last week?"* — answered by traversing a typed graph with
> citations, not by grepping text.

## 3. Goals & non-goals

**Goals**
- Formal, human-writable S–P–O authoring inside ordinary Markdown.
- A rebuildable RDF **quad store** with per-statement and per-document provenance.
- A **schema that lives in the vault** (class-notes, predicate-notes; templates
  as constructors) with optional validation.
- Three faces over one core: **LDP HTTP**, **Obsidian plugin**, **MCP server**.
- Works on **plain Markdown**; Obsidian is the first dialect, not a dependency.

**Non-goals (initially)**
- Being a general triplestore/SPARQL engine (we grow toward query, not compete).
- Perfect W3C LDP conformance on day one (target is chosen deliberately, §7).
- Overloading Obsidian `#tags` with formal semantics (a dedicated SKOS layer
  comes later).

## 4. Core concepts

- **Resource / entity** — a note. It is both a *subject/object* in statements
  and a *named graph* holding the statements authored within it.
- **Statement** — a subject–predicate–object triple, authored in a note.
- **Predicate** — a note (`rdf: property`) defining a relationship's meaning,
  inverse, domain, and range. **Predicates carry the formal semantics.**
- **Class** — a note (`rdf: class`) defining an entity type and its shape;
  a **template** is its constructor; an instance is a typed subject.
- **Named graph** — **each note is a named graph**, named by its IRI. The graph
  name records *where a statement was authored* (authorship provenance),
  distinct from what the statement is *about*.
- **Dataset** — the **vault** is the dataset and the IRI base that namespaces
  all graph names. The "vault graph" is the union of all note-graphs.
- **Provenance** — two levels: the **graph name** (which note asserted it) and
  **RDF-star `(...)`** annotations (per-statement confidence, citation, etc.),
  plus `(file, line, span)` back-references for every quad.

## 5. Architecture

```
Layer 0  Mapping rules: Markdown constructs  ⇄  RDF quads     (tool-agnostic)
Layer 1  Parser + incremental indexer          → SQLite quad store (+ provenance)
Layer 2  Query engine (lightweight → SPARQL over time)
Layer 3  Faces — thin adapters over Layers 0–2:
         ├─ LDP HTTP server  → interop face (note ↔ LDP-RS; folder ↔ container)
         ├─ Obsidian plugin  → authoring, predicate autocomplete, graph views
         └─ MCP server       → AI face: query + cite the graph for an assistant
```

**Source of truth is Markdown; the quad store is a derived, rebuildable index.**
On a file change, we **drop and replace that note's graph** — the named-graph
model makes updates atomic per note, with no stale-quad diffing.

**Stack (assumed; confirm):** TypeScript / Node, yarn, dependency-light. RDF
libraries TBD (N3.js / rdf-ext; Comunica if/when SPARQL).

## 6. The three faces (and why MCP matters most)

- **LDP HTTP server** — the standards face. Because each note is a named graph
  named by its IRI, `GET /note` naturally returns that graph as Turtle; folders
  are containers; the vault is the root. This is where named graphs and LDP
  resources turn out to be *the same idea seen from two sides*.
- **Obsidian plugin** — the authoring face. Predicate autocomplete backed by
  predicate-notes, inline rendering of `(( ))` statements, live graph views.
- **MCP server** — the AI face, and arguably the real product. Instead of an
  assistant grepping fuzzy text, it traverses a typed graph and cites which note
  asserted each fact with what confidence. This is the payoff the whole design
  is built to deliver.

## 7. Key decisions (rationale; full log in `PLAN.md`)

- **Library-first.** One reusable semantic core; every face is a thin adapter.
- **Quad store, note-as-graph.** Named graphs are first-class; the graph name
  doubles as authorship provenance and aligns 1:1 with LDP resources.
- **`(( ))` inline statement syntax.** Distinct, collision-safe, sentence-like.
- **Tags left free.** Predicates carry semantics; a dedicated SKOS layer arrives
  later rather than overloading `#tags`.
- **Specs are gated.** Design precedes build; specs are reviewed before and
  reconciled after each build stage (`PLAN.md` §5).

**Open (blocking Phase 1):** IRI base-namespace scheme; identity default
(path/name vs stable `id:`); stack/monorepo confirmation; LDP conformance
target. See `PLAN.md` §7.

## 8. Map of specs

| Doc | Covers |
|-----|--------|
| `PLAN.md` | Roadmap, phases, spec-review gate, decision log |
| `spec/00-vision.md` | *This doc* — why, what, architecture, faces |
| `spec/01-triple-authoring-syntax.md` | Human authoring surface |
| `spec/02-data-model.md` | IRIs/identity, Markdown→RDF-quads mapping, SQLite schema |
| `spec/03-ldp-http.md` | LDP resources/containers/verbs, conformance target |
| `spec/adr/` | Architecture Decision Records |
