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

**markdown-ldp turns a Markdown knowledge base into a real, typed, provenance-bearing
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
- **Human-first, RDF-hidden.** Maximum readability and writability in ordinary
  Markdown. A layman must be able to author and read meaningful links **without
  understanding RDF, IRIs, CURIEs, or Linked Data theory.** Notes should look
  like notes — `[[Einstein]] ((developed)) [[Relativity]]`, not
  `<urn:…> dct:creator <…> .`. The RDF/LDP machinery is a substrate the tool
  manages; it is never a literacy tax on the author. (Counter-example we reject:
  syntaxes that surface raw IRIs/prefixes and read like gobbledygook.)
- Formal, human-writable S–P–O authoring inside ordinary Markdown.
- A rebuildable RDF **quad store** with per-statement and per-document provenance.
- A **schema that lives in the vault** (class-notes, predicate-notes; templates
  as constructors) with optional validation.
- Three faces over one core: **LDP HTTP**, **Obsidian plugin**, **MCP server**.
- Works on **plain Markdown**; Obsidian is the first dialect, not a dependency.

**Non-goals (initially)**
- **Being a SPARQL engine.** We keep the RDF data model and can hand our quads
  to a real SPARQL engine on demand; we do not implement one. See §5.
- Perfect W3C LDP conformance on day one (target is chosen deliberately, §7).
- Overloading Obsidian `#tags` with formal semantics (a dedicated SKOS layer
  comes later).

## 4. Core concepts

- **Resource / entity** — a note. It is both a *subject/object* in statements
  and a *named graph* holding the statements authored within it.
- **Statement** — a subject–predicate–object triple, authored in a note.
- **Predicate** — a note (`rdf: property`) defining a relationship's meaning,
  inverse, domain, and range. **Predicates carry the formal semantics.** A
  predicate-note also carries its **alignment** to an established vocabulary
  (`subPropertyOf: schema:creator (inverted)`) — see below.
- **Class** — a note (`rdf: class`) defining an entity type and its shape;
  a **template** is its constructor; an instance is a typed subject.
- **Named graph** — **each note is a named graph**, named by its IRI. The graph
  name records *where a statement was authored* (authorship provenance),
  distinct from what the statement is *about*.
- **Dataset** — the **vault** is the dataset and the IRI base that namespaces
  all graph names. The "vault graph" is the union of all note-graphs.
- **Provenance** — two levels: the **graph name** (which note asserted it) and
  **RDF-star `~( … )`** annotations (per-statement confidence, citation, etc.),
  plus `(file, line, span)` back-references for every quad.

## 5. Architecture

```
Layer 0  Mapping rules: Markdown constructs  ⇄  RDF quads     (tool-agnostic)
Layer 1  Parser + incremental indexer          → quad store (+ provenance)   [SQLite, leaning: ADR-0001]
Layer 2  Query layer: a bounded, cited traversal API
         (+ on-demand RDF materialization for external SPARQL engines)
Layer 3  Faces — thin CLIENTS of the core; none owns an index:
         ├─ MCP server       → AI face: query + cite the graph      ← primary
         ├─ CLI              → headless index/query, no editor      ← primary
         ├─ LDP HTTP server  → interop face (note ↔ LDP-RS; folder ↔ container)
         └─ Obsidian plugin  → authoring, predicate autocomplete, graph views
```

**The core owns the store; every face is a client of it.** The core runs
headless (library, plus an optional local daemon) and watches the **filesystem**
— never an editor's event API — so a vault edited by an AI agent, a CLI, or any
Markdown tool indexes identically. Obsidian is one optional client dialect, not
the platform.

**Source of truth is Markdown; the quad store is a derived, rebuildable index.**
On a file change, we **drop and replace that note's graph** — the named-graph
model makes updates atomic per note, with no stale-quad diffing. Because the
store is a *cache*, the backend is swappable behind a `QuadStore` port.

**Store backend leans SQLite — see `spec/adr/0001-quad-store-backend.md`.** A
dictionary-encoded quad table with permutation covering indexes, provenance as a
side table, and FTS5 in the same transaction. Chosen for provenance ergonomics
and hybrid text+graph retrieval, not for speed — speed is invisible behind an
LLM tool call. `spec/02` stays storage-agnostic behind a `QuadStore` port, and
an in-memory store ships first as the reference implementation.

**We keep RDF; we do not build SPARQL.** These are separable commitments, and
conflating them was the ADR's central error. The RDF *data model* (IRIs, named
graphs, quoted triples) is load-bearing — it is what makes note-as-graph work
and `GET /note` → Turtle fall out for free. SPARQL is one *language* over that
model, and a general SPARQL endpoint is a questionable AI surface anyway:
LLMs hallucinate predicates rather than run out of expressiveness, and an empty
result reads to a model as "false" when it means "not asserted." So Layer 2 is a
**small, bounded, provenance-carrying traversal API** — and because the store is
a cache, any subgraph can be **streamed into an in-memory RDF engine for real
SPARQL 1.1 on demand**, in about a second. We never build a compiler; we never
lose the capability. *Tripwire: if we start writing a join planner or a query
parser, stop and mount Oxigraph behind the port (ADR-0001 §7a).*

**Stack (assumed; confirm):** TypeScript / Node, yarn, dependency-light. RDF
libraries TBD (N3.js / rdf-ext; Oxigraph or Comunica as the on-demand SPARQL
hatch only).

## 6. The three faces (and why MCP matters most)

- **LDP HTTP server** — the standards face. Because each note is a named graph
  named by its IRI, `GET /note` naturally returns that graph as Turtle; folders
  are containers; the vault is the root. This is where named graphs and LDP
  resources turn out to be *the same idea seen from two sides*.
- **Obsidian plugin** — the authoring face. Predicate autocomplete backed by
  predicate-notes, inline rendering of `(( ))` statements, live graph views.
- **MCP server (+ CLI)** — the AI face, and **the real product**. Instead of an
  assistant grepping fuzzy text, it traverses a typed graph and cites which note
  asserted each fact with what confidence. This is the payoff the whole design
  is built to deliver — and it is the face that must work when the user has *no
  Markdown client at all*, just a folder and an assistant. Design for that user
  first; the plugin is a convenience layered on top.

## 7. Key decisions (rationale; full log in `PLAN.md`)

- **Human-first, RDF-hidden (design north star).** Every syntax and default is
  chosen for a layman writer, not an RDF expert. Full IRIs and CURIEs are an
  *optional* power-user layer; the common path uses note names and plain-word
  predicates. This principle **breaks ties** across the whole design (see §3
  Goals) and directly shapes identity (prefer names over minted IDs) and CURIEs
  (a convenience the tool hides, never a requirement).
- **Library-first.** One reusable semantic core; every face is a thin adapter.
- **Quad store, note-as-graph.** Named graphs are first-class; the graph name
  doubles as authorship provenance and aligns 1:1 with LDP resources.
- **`(( ))` inline statement syntax.** Distinct, collision-safe, sentence-like.
- **Tags left free.** Predicates carry semantics; a dedicated SKOS layer arrives
  later rather than overloading `#tags`.
- **Specs are gated.** Design precedes build; specs are reviewed before and
  reconciled after each build stage (`PLAN.md` §5).

- **Bounded query surface over a SPARQL endpoint.** For an AI consumer, a small
  set of named, cited, bounded operations beats a general query language: it
  makes the model's ignorance legible instead of letting it manufacture
  confident false negatives. (ADR-0001 §4a.)
- **Established vocabularies are a mapping target, never the authoring
  surface.** Authors write `((developed))`; the predicate-note carries
  `subPropertyOf: schema:creator (inverted)`. Schema.org earns its place mainly
  because **LLMs already know it from pretraining** — emitting those IRIs makes
  the graph legible with no schema-teaching in the prompt. CiTO covers the
  epistemic relations schema.org lacks (`supports`, `disagreesWith`).
- **AI curates the vocabulary; it never resolves it.** Free-form predicate
  minting must always work, but it fragments a vault into synonyms and makes
  queries under-recall *confidently*. So an AI **proposes** an alignment, a
  human accepts, and the result becomes a durable line of Markdown — after
  which resolution is deterministic forever. AI in the query path would cost
  determinism, testability, offline use, and, decisively, **exact citation**.
  (`spec/02` §5.)

- **Identity is always vault-local; external identity is an assertion.** A note's
  IRI is minted under the vault's base — path-derived, or `⟨base⟩id/⟨token⟩` when
  pinned. An `id:` is never an absolute URI. To say a note is *about* a resource
  that already has an IRI, the author writes `sameAs:` and gets an `owl:sameAs`
  statement. The distinction matters because a note about Einstein is a
  **document**, not the person — and because you cannot serve an IRI you don't
  control. (`spec/02` §3.2.)

**Closed since:** IRI scheme (configurable base, `https://` default, stored
vault-relative); identity default (name/path derived, stable `id:` wins, tool
mints ids, **always vault-local**); CURIEs (vocabulary + serialization via a
vault prefix-map note — not identity); the core owns the store, clients query it.
**Leaning (safe to spec against):** SQLite quad store and SPARQL demoted to an
on-demand hatch (ADR-0001); vocabulary stored as ordinary quads (ADR-0002); quad
identity as a canonical serialization (ADR-0003); `domain`/`range` emitted as
`mldp:`, not `rdfs:` (ADR-0004). **Still open (blocking Phase 1):**
stack/monorepo confirmation; LDP conformance target. Full log in `PLAN.md` §7.

## 8. Map of specs

| Doc | Covers |
|-----|--------|
| `PLAN.md` | Roadmap, phases, spec-review gate, decision log |
| `spec/00-vision.md` | *This doc* — why, what, architecture, faces |
| `spec/01-triple-authoring-syntax.md` | Human authoring surface |
| `spec/02-data-model.md` | IRIs/identity, **vocabulary layer & alignment**, Markdown→RDF-quads mapping, provenance, `QuadStore` port (storage-agnostic) |
| `spec/03-ldp-http.md` | LDP resources/containers/verbs, conformance target |
| `spec/04-index-store.md` | Physical store schema + indexer (starts from ADR-0001 §5d) |
| `spec/adr/0001-quad-store-backend.md` | **LEANING SQLite** — backend, the RDF/SPARQL split, documented limits |
| `spec/adr/0002-vocabulary-storage.md` | **LEANING quads + derived index** — where alignments live, how closure reads them |
| `spec/adr/0003-canonical-term-and-quad-identity.md` | **LEANING canonical string** — quad equality, provenance keying |
| `spec/adr/0004-domain-range-semantics.md` | **LEANING `mldp:`** — constraints, not RDFS inference |
