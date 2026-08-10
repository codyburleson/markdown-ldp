# markdown-ldp

**Turn a folder of Markdown notes into a typed, provenance-bearing knowledge
graph — so an AI can reason over your vault instead of grepping it.**

Your notes stay ordinary Markdown. You gain the ability to say *how* two things
relate, *who* asserted it, and *how confident* you were — and to get that back
out with citations.

> ### ⚠️ Status: design phase — no code yet
>
> This repository currently contains **specifications only**. There is nothing
> to install and nothing to run. We're designing before building, deliberately
> ([why](PLAN.md#5-the-spec-review-gate-recurring-practice)). If you're here
> from a search: come back later, or read the specs and tell us where we're
> wrong.

---

## The problem

Personal knowledge bases are built on **untyped links**. `[[Einstein]]` next to
`[[Relativity]]` says the two notes are *related* — not *how*. As a vault grows,
it becomes a pile of connected pages that resists real reasoning.

Meanwhile AI assistants are increasingly the thing reading these vaults, and
they're stuck with full-text search and fuzzy inference, because there's no
structured graph to reason over.

## What it looks like

Ordinary note, ordinary Markdown:

```markdown
---
type: [[Person]]
born: 1879-03-14
---
Albert Einstein, theoretical physicist.

field:: [[Physics]]

[[Einstein]] ((developed)) [[Theory of Relativity]] ~(source:: [[Pais 1982]], confidence:: 0.95)
```

Three things are happening:

- `field:: [[Physics]]` — a **typed statement about this note** (Dataview-style,
  no new syntax to learn).
- `((developed))` — a **predicate**, fenced so it can't collide with prose. It
  resolves to a note that *defines what "developed" means*.
- `~( … )` — **metadata about the statement itself**, not about Einstein. Source
  and confidence, attached to the claim.

Nothing here requires knowing what RDF is. That's the point.

## Why an AI can actually use it

The **north-star question**:

> *"What did Einstein develop, with what evidence, and how does it connect to
> notes I wrote last week?"*

— answered by traversing a typed graph **with citations**, not by grepping text.

Every fact traces back to `(file, line, span)`. Every answer can say which note
asserted it, and how sure you were when you wrote it.

## The vocabulary problem (and why this design is unusual)

Let people invent predicates freely and, five years in, a vault has `developed`,
`created`, `authored`, `made`, and `built` as five unrelated things. "What did
Einstein develop?" then returns one of them and misses four — **confidently,
with citations, looking complete.** That's worse than no answer.

So predicates get **aligned to established vocabularies** — mostly
[schema.org](https://schema.org), plus [CiTO](http://purl.org/spar/cito/) for
the epistemic relations (`supports`, `disagreesWith`, `citesAsEvidence`) that
schema.org has no words for.

```markdown
---
rdf: property
subPropertyOf: schema:creator (inverted)
inverseOf: [[developed by]]
---
X developed Y means X was the principal creator of Y.
```

Two design choices make this work:

**Established vocabularies are a mapping target, never the authoring surface.**
You write `((developed))`. You never write `((schema:creator))`. Schema.org
matters here mainly because **LLMs already know it from pretraining** — so
emitting those IRIs makes the graph legible with no schema-teaching in the
prompt.

**AI curates the vocabulary; it never resolves it.** An AI *proposes* an
alignment, a human accepts it, and the result becomes a durable line of
Markdown. After that, resolution is deterministic — git-diffable, reversible,
testable, offline, free. Putting a model in the query path would cost all of
that, and it would break exact citation, which is the whole product.

## Design decisions worth knowing

| | |
|---|---|
| **Human-first, RDF-hidden** | A layman must author meaningful links without knowing what an IRI is. This principle breaks ties across the entire design. |
| **Markdown is the source of truth** | The index is a derived cache, always rebuildable. Being wrong about storage costs a reindex, not your data. |
| **Each note is a named graph** | Named by its IRI. The graph name records *where a statement was authored* — authorship provenance — and maps 1:1 to an LDP resource. |
| **Untyped `[[links]]` mint nothing** | An untyped link is not a statement. This restraint is what keeps the graph a graph of *meaning* rather than a link dump. |
| **Tags stay free** | No triples from `#tags`. A dedicated SKOS layer comes later rather than overloading them. |
| **We keep RDF; we don't build SPARQL** | The query surface is a small, bounded, *cited* traversal API — the right shape for an AI consumer. Because the index is a cache, any subgraph can be handed to a real SPARQL engine on demand. |
| **The core owns the store** | Every face is a thin client. Obsidian is one optional dialect, not the platform — the target user may have no Markdown editor at all, just a folder and an assistant. |

## Architecture

```
Layer 0  Mapping rules: Markdown constructs  ⇄  RDF quads      (tool-agnostic)
Layer 1  Parser + incremental indexer  → quad store + provenance
Layer 2  Query layer: bounded, cited traversal
Layer 3  Faces — thin clients; none owns an index:
         ├─ MCP server       → the AI face          ← primary
         ├─ CLI              → headless, no editor  ← primary
         ├─ LDP HTTP server  → interop (W3C LDP)
         └─ Obsidian plugin  → authoring convenience
```

One reusable **TypeScript** core. The core runs headless and watches the
**filesystem**, so a vault edited by an AI agent, a CLI, or any editor indexes
identically.

Store: leaning **SQLite** — a dictionary-encoded quad table with permutation
covering indexes, provenance as a plain side table, and full-text search in the
same transaction as the graph. Chosen for provenance ergonomics and hybrid
text+graph retrieval, explicitly *not* for speed
([reasoning](spec/adr/0001-quad-store-backend.md)).

## The specs

Start at the top; each links onward.

| Doc | What it covers | Status |
|---|---|---|
| **[spec/00-vision.md](spec/00-vision.md)** | **Start here.** Why, what, architecture, the faces | draft |
| [spec/01-triple-authoring-syntax.md](spec/01-triple-authoring-syntax.md) | How humans write triples in Markdown | draft v0.2 |
| [spec/02-data-model.md](spec/02-data-model.md) | Identity/IRIs, the vocabulary layer, Markdown→quads, provenance, the store port | draft v0.1 |
| `spec/03-ldp-http.md` | LDP resources, containers, verbs | not written |
| `spec/04-index-store.md` | Physical schema, indexer, scale envelope | not written |
| [spec/adr/0001](spec/adr/0001-quad-store-backend.md) | Store backend + the RDF/SPARQL split | leaning SQLite |
| **[PLAN.md](PLAN.md)** | Roadmap, phases, the spec-review gate, full decision log | living |

## Roadmap

| Phase | | |
|---|---|---|
| 1 | Design & specification | ← **here** |
| 2 | Semantic core: parser, mapping engine, `QuadStore` port | |
| 3 | Index & query: SQLite store, incremental indexer, traversal API | |
| 4 | Schema & validation: class-notes, shapes | |
| 5 | Faces: MCP server, CLI, LDP HTTP, Obsidian plugin | |
| 6 | SKOS concepts & the AI-curation loop | |

Scale, to be replaced by measured numbers: a serious vault is ~10k–300k quads,
a large one ~1–2M. Documented limits are treated as a deliverable, not a
footnote.

## Contributing

The most useful contribution right now is **finding holes in the specs** —
especially in [spec/02](spec/02-data-model.md), which is the newest and the one
all the code will be written against. Open an issue.

## License

TBD.
