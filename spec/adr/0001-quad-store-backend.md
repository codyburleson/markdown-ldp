# ADR-0001 — Quad store backend

Status: **OPEN — deliberation in progress.** Decision gated on a benchmark
(§6). Until closed, no spec may state SQLite as decided.

Context date: 2026-08-07

---

## 1. Why this ADR exists

`spec/00-vision.md`, `PLAN.md`, and `README.md` all said "**SQLite** quad store"
as though it were settled. It never was — it was an assumption inherited from
the first sketch. It is load-bearing: it appears in the Layer-1 architecture
diagram, in the Phase-3 roadmap, and in the planned contents of
`spec/02-data-model.md`. If it is wrong, it is expensive to discover late.

The question is not only "does SQLite work?" but "**what are the limits, and do
we state them honestly?**" A personal vault that outgrows the index silently is
a worse failure than one that hits a documented, understood ceiling.

## 2. What the store must actually do

Derived from decisions already locked (`PLAN.md` §2):

| # | Requirement | Source |
|---|---|---|
| R1 | Store **quads** `(s, p, o, g)`; named graphs first-class | note-as-graph |
| R2 | **Drop-and-replace one graph** atomically on file change | incremental indexer |
| R3 | Carry **provenance** per quad: `(file, line, span)`, many spans per deduped quad | provenance-always |
| R4 | Represent **RDF-star** annotations (`~( … )`) — quoted triples as terms | statement metadata |
| R5 | Serve **pattern queries** now, grow toward **SPARQL** later | Layer 2 |
| R6 | Be **rebuildable from scratch** — it is a cache, never authoritative | Markdown-is-truth |
| R7 | Run **headless** and be reachable from all faces (MCP, CLI, HTTP, plugin) as clients | Layer 3, §5a |
| R8 | Full-text search over note bodies (for hybrid graph+text retrieval by AI) | MCP face |

R7 was the requirement most likely to break a backend choice and was not being
weighed at all. It is now defused — see §5a: the core owns the store and clients
talk to it, so no client's runtime constrains the engine.

## 3. Scale: how big does a personal vault's graph actually get?

Order-of-magnitude estimate, to be replaced by measured numbers (§6).

Notes per vault:

| Vault | Notes |
|---|---|
| Casual | 500 – 2,000 |
| Serious daily user | 3,000 – 10,000 |
| Large / decade-old | 20,000 – 50,000 |
| Outlier (bulk imports: Zotero, RSS, dataset dumps) | 100,000+ |

Quads per note under this design — untyped `[[links]]` do **not** mint triples,
so density is driven by frontmatter fields, `key:: value`, and `(( ))`
statements:

| Style | Quads/note |
|---|---|
| Prose note, light frontmatter | 3 – 8 |
| Typical typed note | 10 – 30 |
| Dense structured note (class instance, imported record) | 50 – 200 |

**Working envelope: ~10k–300k quads typical; ~1–2M for a large vault; ~10M+
only under bulk import.** Plus a provenance row per authored occurrence (~1.1×
quad count) and a term dictionary (~0.2× distinct terms).

**Conclusion on scale: SQLite is not the bottleneck.** A dictionary-encoded
quad table with covering indexes is roughly 150–250 bytes/quad including
indexes → ~250 MB at 1M quads, ~2.5 GB at 10M. SQLite handles that row count
without complaint for point lookups and small joins; it routinely runs orders
of magnitude larger. **The risk was mis-framed as a capacity risk. It isn't.**

The genuine risks are capability, embedding, and effort — §4, §5.

## 4. The real risks

**RR1 — SPARQL is a multi-month build on a hand-rolled SQL schema.** Layer 2
says "grow toward SPARQL." Over SQLite that means writing a BGP→SQL compiler
plus OPTIONAL, UNION, property paths, aggregates, and a join planner — and
SQLite's planner degrades on the 6–10 self-joins a mid-size BGP produces. An
off-the-shelf RDF engine gives SPARQL 1.1 on day one.

**RR2 — SQLite is hostile to the Obsidian plugin face (R7).** *[RETIRED by §5a —
the plugin no longer embeds a store. Kept for the record.]* `better-sqlite3`
is a native module compiled per Node/Electron ABI; Obsidian community plugins
cannot reliably ship native binaries across macOS/Windows/Linux and Obsidian
upgrades. The WASM routes (`sql.js`, `wa-sqlite`) work but are memory-resident
with manual persistence, and pay a size/startup cost. This constraint applies
to *any* native backend and is the sharpest one on the board.

**RR3 — RDF-star modeling (R4).** Quoted triples need to be first-class terms.
Expressible in SQL (a term kind pointing at a triple row), but fiddly and easy
to get subtly wrong. Engines with native RDF-star support hand this over.

**RR4 — Two-engine drift** if we split "system of record" from "query engine."

Counterweight, and it is a strong one: **R6 means the store is a cache.** Being
wrong here costs a rewrite of one layer and a reindex, not data loss and not a
migration. That caps the downside — but it argues for a *port boundary*, not
for skipping the analysis.

## 5. Candidates

The "plugin" column is retained for the record but is **no longer a
tiebreaker** — see §5a.

| | Backend | SPARQL | Named graphs | RDF-star | ~~Runs in plugin~~ | Persistent | Escape hatch |
|---|---|---|---|---|---|---|---|
| **A** | SQLite, hand-rolled quad schema (`better-sqlite3` / WASM) | build it (RR1) | yes (column) | manual (RR3) | painful (RR2) | yes | SQL, FTS5 (R8) |
| **B** | Oxigraph (`oxigraph` npm — Rust, native + WASM builds) | **1.1 free** | native | **native** | WASM build, memory-only | native yes / WASM no | none |
| **C** | quadstore (pure JS on abstract-level) + Comunica | via Comunica | native | partial | **yes, pure JS** | yes (level) | none |
| **D** | Hybrid: SQLite of record + in-memory RDF engine for query | free | yes | yes | plugin uses in-mem only | yes | SQL + FTS5 |
| **E** | In-memory only (N3.js Store), rebuild at startup | via Comunica | native | yes | yes | no | none |

Notes: **A** maximizes control, inspectability, provenance ergonomics (R3 is a
plain side table), and gives R8 free via FTS5 — at the cost of RR1 and RR2.
**B** collapses RR1/RR3/R5 to a dependency and, now that the core runs in Node
rather than inside Electron (§5a), can use its **native** persistent build. **E**
is honest about what a personal vault is: at ≤300k quads a full in-memory graph
is ~100–200 MB and rebuilds in seconds — the "index" may be a startup cost, not
a database. Its weakness is the headless-daemon case (R7), where paying a full
reparse on every cold start gets tiresome at 50k notes.

With §5a settled, the contest is **A vs. B**, and it reduces to one trade:
SQLite buys control, FTS5 (R8), a SQL escape hatch, and plain-table provenance
(R3), at the price of building SPARQL yourself (RR1). Oxigraph buys SPARQL 1.1
and RDF-star (R4) outright, at the price of modeling provenance *as quads* and
having no escape hatch. The benchmark decides.

### 5a. Sub-question CLOSED (2026-08-07): the core owns the store, not the client

**Decision: one core owns the index; every client talks to it. No client embeds
its own store.**

Rationale: Obsidian is **one optional client dialect among several**, not the
platform. Users may use other Markdown tools, and the near-term trajectory is a
user interacting with a plain folder of Markdown **entirely through an AI, with
no Markdown client at all**. A face that may not exist cannot be allowed to
dictate the storage engine for the whole system.

Consequences:
- **RR2 is retired as a constraint on the backend choice.** The plugin never
  loads a store, so the Electron-native-module problem does not reach the core.
  **A (SQLite) and B (Oxigraph) both fully re-open**; the choice is now decided
  on RR1/RR3, R3, R5 and R8 alone — i.e. on the benchmark (§6), as intended.
- **The core MUST run headless** — as a library in a Node process, and as a
  small local daemon when a long-lived index is wanted. No editor required to
  parse, index, or query a vault.
- **The change watcher MUST be filesystem-level, never Obsidian's event API.**
  Files will be written by AI agents, CLIs, sync clients, and other editors;
  the filesystem is the only channel that sees all of them.
- **The Obsidian plugin becomes a thin client** over the same local interface
  the MCP and HTTP faces use. It is a rendering/authoring convenience, not a
  privileged path to the data.
- **The MCP server and CLI are the primary faces.** Phase 5 already sequences
  MCP first; this makes that a structural fact rather than a value judgement.
- The client↔core transport (in-process call / local HTTP / IPC) is a separate,
  smaller decision — it does not gate this ADR.

## 6. Decision gate — what closes this ADR

Do **not** decide from argument alone. Before Phase 3 entry:

1. **Synthetic vault generator** — emit vaults at 1k / 10k / 50k notes × light
   / typical / dense triple density, from the `spec/01` authoring syntax.
2. **Measure, per candidate** (A, B, E at minimum): cold full index time; single
   note re-index (R2) latency; store size on disk and in RSS; p50/p95 for the
   five query shapes the MCP face actually issues (1-hop typed neighbors,
   2-hop, provenance lookup, type-filtered scan, hybrid text+graph); startup
   time from cold.
3. **Prototype the two hard bits** on the leading candidate: RDF-star terms
   (R4) and provenance-with-multiple-spans (R3).
4. **Publish a scale envelope** in `spec/02`: tested vault sizes, measured
   numbers, and the point at which we tell the user "beyond here, use X."
   Documented limits are a deliverable, not a footnote.

## 7. Provisional position (not a decision)

- Define a **`QuadStore` port** in Phase 2 — the mapping engine and query layer
  talk to an interface, never to SQL. Backend swap stays a one-module change.
- Ship **E (in-memory)** first as the reference implementation; it is the
  simplest thing that satisfies R1–R6 at typical vault size and it makes the
  port real by construction.
- Treat **A (SQLite)** as the leading *persistent* backend on the strength of
  R3/R8 and inspectability, and **B (Oxigraph, native build)** as the leading
  escape route if SPARQL (R5) becomes urgent before we can build it.
- ~~Settle the "does the plugin own a store?" sub-question early.~~ **Closed —
  see §5a.** The core owns the store; clients query it.

## 8. Consequences of leaving this open

`spec/02-data-model.md` must be written **storage-agnostic**: identity/IRI
rules, the Markdown→quads mapping, the term/provenance *logical* model, and the
`QuadStore` port. Any concrete physical schema moves to `spec/04-index-store.md`
and is written after this ADR closes. This unblocks Phase 1 — the data model
does not depend on the backend.
