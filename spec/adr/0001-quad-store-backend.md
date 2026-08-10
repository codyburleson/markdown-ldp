# ADR-0001 — Quad store backend

Status: **LEANING — SQLite (candidate A), with SPARQL demoted from a store
requirement to an on-demand escape hatch.** Specs MAY now be written against
SQLite as the presumed backend, provided they respect the `QuadStore` port
(§7). Final closure is gated on a *reduced* measurement pass (§6) that
establishes the scale envelope — no longer on an engine bake-off.

Context date: 2026-08-07 · Leaning recorded: 2026-08-09

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

The ADR now lands on SQLite — but on *different grounds* than the original
sketch assumed, and only after the requirement that argued hardest against it
(SPARQL) was re-examined and found to be misspecified. See §4a.

## 2. What the store must actually do

Derived from decisions already locked (`PLAN.md` §2):

| # | Requirement | Source |
|---|---|---|
| R1 | Store **quads** `(s, p, o, g)`; named graphs first-class | note-as-graph |
| R2 | **Drop-and-replace one graph** atomically on file change | incremental indexer |
| R3 | Carry **provenance** per quad: `(file, line, span)`, many spans per deduped quad | provenance-always |
| R4 | Represent **RDF-star** annotations (`~( … )`) — quoted triples as terms | statement metadata |
| R5a | Serve a **small, fixed set of bounded traversal/pattern operations**, provenance-carrying | Layer 2 / MCP face |
| R5b | **Materialize any subgraph as RDF** for an external SPARQL engine | interop |
| R6 | Be **rebuildable from scratch** — it is a cache, never authoritative | Markdown-is-truth |
| R7 | Run **headless** and be reachable from all faces (MCP, CLI, HTTP, plugin) as clients | Layer 3, §5a |
| R8 | Full-text search over note bodies (for hybrid graph+text retrieval by AI) | MCP face |

R5 was originally one requirement — *"serve pattern queries now, grow toward
SPARQL later."* Splitting it into R5a/R5b is the decisive change in this ADR;
see §4a.

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

**Nor is it a throughput risk.** The consumer of this store is an LLM tool call
with hundreds of milliseconds of round-trip latency. A backend that wins a
point-lookup microbenchmark 3× (see §5b) delivers a difference no user of this
system can perceive. Raw query speed is **not a deciding axis** in this ADR, and
should not be allowed to become one.

The genuine risks are capability, embedding, and effort — §4, §5.

## 4. The risks, as originally framed

**RR1 — SPARQL is a multi-month build on a hand-rolled SQL schema.** Layer 2
says "grow toward SPARQL." Over SQLite that means writing a BGP→SQL compiler
plus OPTIONAL, UNION, property paths, aggregates, and a join planner — and
SQLite's planner degrades on the 6–10 self-joins a mid-size BGP produces. An
off-the-shelf RDF engine gives SPARQL 1.1 on day one.
***[DISSOLVED by §4a. This was the strongest argument against SQLite, and it
rested on a requirement we had specified wrong.]***

**RR2 — SQLite is hostile to the Obsidian plugin face (R7).** *[RETIRED by §5a —
the plugin no longer embeds a store. Kept for the record.]* `better-sqlite3`
is a native module compiled per Node/Electron ABI; Obsidian community plugins
cannot reliably ship native binaries across macOS/Windows/Linux and Obsidian
upgrades. The WASM routes (`sql.js`, `wa-sqlite`) work but are memory-resident
with manual persistence, and pay a size/startup cost. This constraint applies
to *any* native backend and is the sharpest one on the board.

**RR3 — RDF-star modeling (R4).** Quoted triples need to be first-class terms.
Expressible in SQL (a term kind pointing at a triple row), but fiddly and easy
to get subtly wrong. **Reassessed as small** — see §5c.

**RR4 — Two-engine drift** if we split "system of record" from "query engine."
*Still live, and it now cuts **toward** SQLite* — see §5b, where the KV
candidates reintroduce it through the full-text index.

Counterweight, and it is a strong one: **R6 means the store is a cache.** Being
wrong here costs a rewrite of one layer and a reindex, not data loss and not a
migration. That caps the downside — but it argues for a *port boundary*, not
for skipping the analysis.

### 4a. The requirement that was wrong: separating RDF from SPARQL

The specs conflated two commitments that are in fact independent:

- The **RDF data model** — IRIs, named graphs, quoted triples. This is
  load-bearing. It is what makes note-as-graph work, what makes `GET /note` →
  Turtle fall out for free, and what makes the vault exportable to anything.
  **Keep all of it.**
- **SPARQL** — one query *language* over that model. Entirely separable.

Once separated, three observations follow.

**(i) What SPARQL actually buys here is thinner than assumed.**

| Capability | Value to this project | Cheaper route |
|---|---|---|
| Multi-pattern joins (BGP) | Moderate — the five MCP shapes are 1–2 hops | Five fixed SQL queries |
| Property paths (`subClassOf*`, `partOf+`) | **Genuinely valuable** | SQLite recursive CTE |
| OPTIONAL / left-join result shaping | Useful for feeding an LLM tidy rows | `LEFT JOIN` |
| Aggregates, CONSTRUCT | Marginal | SQL; direct graph serialization |
| Ad-hoc power users, imported ontologies | Real but rare | On-demand hatch, (iii) |

Nothing on that list justifies a join planner.

**(ii) A general SPARQL endpoint is arguably the *wrong* AI surface, not merely
an expensive one.**

1. **The bottleneck is vocabulary, not expressiveness.** LLMs emit syntactically
   valid SPARQL and hallucinate predicates. The failure you will actually hit is
   `?s :developed ?o` returning nothing because the vault says `:created`. The
   fix is schema-discovery tooling and good predicate naming — not a richer
   query language.
2. **Empty results are semantically dangerous.** Under open-world semantics an
   empty binding means "not asserted"; a model reads it as "false." A general
   endpoint multiplies the ways a model can generate confident false negatives.
   Bounded, purpose-named operations make the model's ignorance legible to it.
3. **Unbounded queries are an operational footgun** in a tool loop — timeouts,
   and 40k-row result sets that blow the context window.
4. **The differentiator is citation, not query power.** "Which note asserted
   this, at which line, with what confidence" (`spec/00` §6) is a
   provenance-join problem — and provenance is precisely what RDF engines model
   *worst* (R3 becomes reification or a parallel graph).

**(iii) R6 gives SPARQL back for free, on demand.** Because the store is a cache
of ≤1–2M quads, any subgraph — or the whole dataset — can be streamed into an
in-memory RDF engine (Oxigraph WASM, or Comunica over an N3 Store) and queried
with full SPARQL 1.1 in roughly a second, whenever someone actually wants it.
We never build a compiler and we never lose the capability. That is R5b.

**Consequence: RR1 is dissolved, not accepted.** The multi-month cost that was
the leading argument against SQLite is not a cost we have to pay under a correct
reading of the requirement.

## 5. Candidates

The "plugin" column is retained for the record but is **no longer a
tiebreaker** — see §5a.

| | Backend | SPARQL | Named graphs | RDF-star | ~~Runs in plugin~~ | Persistent | FTS (R8) | Escape hatch |
|---|---|---|---|---|---|---|---|---|
| **A** | **SQLite, hand-rolled quad schema** (`better-sqlite3` / WASM) | via R5b hatch | yes (column) | manual (RR3, small) | painful (RR2) | yes | **FTS5, same txn** | SQL |
| **B** | Oxigraph (`oxigraph` npm — Rust, native + WASM builds) | 1.1 free | native | native | WASM build, memory-only | native yes / WASM no | no | none |
| **C** | quadstore (pure JS on abstract-level) + Comunica | via Comunica | native | partial | yes, pure JS | yes (level) | no | none |
| **D** | Hybrid: SQLite of record + in-memory RDF engine for query | free | yes | yes | plugin uses in-mem only | yes | FTS5 | SQL |
| **E** | In-memory only (N3.js Store), rebuild at startup | via Comunica | native | yes | yes | no | no | none |
| **F** | **Embedded KV, permutation indexes** (LMDB / RocksDB) | via R5b hatch | yes (key prefix) | manual | yes (WASM builds exist) | yes | **no — bolt-on** | none |

Notes: **A** maximizes control, inspectability, provenance ergonomics (R3 is a
plain side table), and gives R8 free via FTS5. **B** collapses R5/RR3 to a
dependency and, now that the core runs in Node rather than inside Electron
(§5a), can use its **native** persistent build — but models provenance as quads
and has no escape hatch. **E** is honest about what a personal vault is: at
≤300k quads a full in-memory graph is ~100–200 MB and rebuilds in seconds; its
weakness is the headless-daemon case (R7), where a full reparse on every cold
start gets tiresome at 50k notes. **F** is evaluated in §5b.

Note that **D is what A + R5b actually is.** With SPARQL demoted to an
on-demand materialization, the "hybrid" candidate stops being a two-engine
architecture and becomes a single engine of record plus a disposable,
ephemeral query engine instantiated only when asked. A and D converge.

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
  Both SQLite and Oxigraph fully re-open; the choice is decided on
  RR1/RR3, R3, R5 and R8 alone.
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

### 5b. Sub-question CLOSED (2026-08-09): embedded key/value stores (candidate F)

**Considered and rejected — but its central design idea is adopted (§5d).**

*Redis is out on deployment grounds, separately and first.* It is a **server**,
not an embedded store — a daemon the user must install and run, which is not a
defensible dependency for a personal tool that should be `yarn add` and go. Its
persistence model (RDB snapshots / AOF) is snapshot-oriented rather than
transactional-embedded, a poor fit for R2. RedisGraph/FalkorDB is a Docker
deployment *and* a **property** graph, which would forfeit the named-graph/quad
fit that note-as-graph and the LDP face depend on.

The serious form of the idea is an **embedded** KV store — LMDB (`lmdb-js`),
RocksDB/LevelDB (the `abstract-level` family) — with the classical
**permutation-index** design: store each quad six times under different key
orderings (`SPOG`, `POSG`, `OSPG`, `GSPO`, `GPOS`, `OGPS`) with empty values,
then answer any pattern by seeking the permutation whose prefix matches the
bound positions and range-scanning. This is not a shortcut; it is how Jena TDB,
RDF4J native, Blazegraph and LevelGraph work, and candidate **C** (quadstore) is
exactly this design in JavaScript. Two properties are genuinely elegant here:

- **R2 becomes a prefix range delete** on the `G…` index — the cleanest
  expression of our central write operation of any candidate on the board.
- **BGP joins need no cost-based planner** — sorted streams merge-join
  naturally, which is precisely why the classical engines chose it.

Rejected for three reasons, in descending weight:

1. **R8 is fatal.** LMDB and RocksDB have no full-text search. A bolt-on index
   (MiniSearch, Tantivy, hand-rolled inverted index) means owning consistency
   between the graph store and the text store on every reindex, with no shared
   transaction — **RR4 reintroduced through the back door, in the component
   used on every hybrid retrieval.** FTS5 lives in the same file, in the same
   transaction, joinable in one statement.
2. **R3 has nowhere natural to live.** Many `(file, line, span)` rows per
   deduped quad is a side table with a foreign key and an index. In KV it is
   another hand-rolled keyspace plus application-code assembly, with no ad-hoc
   way to ask "show me every quad with more than one span" when the index looks
   wrong.
3. **Inspectability, which matters more than it sounds.** We are about to spend
   months with an index that is subtly wrong in unanticipated ways — mapping
   bugs, IRI normalization bugs, span-offset bugs. With SQLite you open the file
   and `SELECT`. With LMDB you write a debug dumper before you can even see the
   problem. Under spec-driven development (`PLAN.md` §5) that difference
   compounds at every gate.

Plus: every join, aggregate, and transitive closure becomes TypeScript we write
and maintain, where SQLite supplies a planner, `LEFT JOIN`, and recursive CTEs.

On performance — LMDB may beat SQLite 2–5× on raw point lookups. Per §3, that
difference is invisible behind an LLM tool call. It does not purchase FTS5 or
debuggability at any exchange rate.

**Retained as a future option, not a current one.** An LMDB backend behind the
`QuadStore` port remains reasonable for the §3 bulk-import outlier, where write
throughput could genuinely matter. That is not the case we are building for.

### 5c. RR3 reassessed: RDF-star is small

For the use we actually have — annotation-only, `~( … )` attaching confidence,
citation, or source to a statement — a quoted triple is a `terms` row with
`kind = 'triple'` whose value is a foreign key to a quad id. That is a
self-referential table, which is ordinary. The fiddliness in RR3 was written
with general RDF-star nesting in mind; our authoring syntax (`spec/01`) does not
produce it. **Downgraded from a risk to a modeling note.** Still prototyped in
§6 before closure.

### 5d. What we take from the KV design

The permutation insight is right, and it should be implemented *inside* SQLite.
SQLite is already a B-tree key/value store under the hood; a covering-index seek
**is** a prefix range scan. The physical sketch (normative form lands in
`spec/04-index-store.md`):

- **Dictionary-encode terms** to integers — `terms(id, kind, value)`, where
  `kind` covers IRI / literal / blank / **quoted-triple** (§5c).
- **Quad table of four integer columns** — `quads(s, p, o, g)`.
- **Permutation set as covering indexes** — `(s,p,o,g)`, `(p,o,s,g)`,
  `(o,s,p,g)`, `(g,s,p,o)` — chosen from the five query shapes we actually
  issue, rather than all six by reflex. R2 is then `DELETE … WHERE g = ?`
  against the `g`-leading index.
- **Provenance as a side table** keyed by quad id: `(quad_id, file, line,
  start, end)`, many rows per quad (R3).
- **FTS5 over note bodies in the same database** (R8), joinable to `quads` in a
  single statement.

Result: the classical architecture's access patterns, with SQL's ergonomics —
one file, one transaction.

## 6. Decision gate — what closes this ADR

The gate is **reduced**. It was an engine bake-off; with RR1 dissolved (§4a) and
F rejected (§5b), there is no longer a contest to run. What remains is a
**scale-envelope measurement plus two prototypes** — necessary to publish honest
limits (§1), not to pick a winner. Before Phase 3 exit:

1. **Synthetic vault generator** — emit vaults at 1k / 10k / 50k notes × light
   / typical / dense triple density, from the `spec/01` authoring syntax.
   *(Unchanged; already scheduled in Phase 2.)*
2. **Measure candidate A**: cold full index time; single note re-index (R2)
   latency; store size on disk and in RSS; p50/p95 for the five query shapes the
   MCP face issues (1-hop typed neighbors, 2-hop, provenance lookup,
   type-filtered scan, hybrid text+graph); startup time from cold.
   Measure **E (in-memory)** alongside, since it ships first as the reference
   implementation (§7) and its numbers set the "is persistence even needed
   below N notes?" threshold. **B and F need not be benchmarked** — they are no
   longer in contention and speed is not the deciding axis (§3).
3. **Prototype the two remaining hard bits** on A: RDF-star terms (R4, §5c) and
   provenance-with-multiple-spans (R3).
4. **Exercise R5b once** — stream a full vault's quads into an in-memory RDF
   engine and run a real SPARQL 1.1 query. This is a *validation that the hatch
   exists*, not a component to build on. Record the materialization time.
5. **Publish a scale envelope** in `spec/04`: tested vault sizes, measured
   numbers, and the point at which we tell the user "beyond here, use X."
   Documented limits are a deliverable, not a footnote.

## 7. Position

**Lean: candidate A — SQLite, hand-rolled quad schema (§5d), with SPARQL as an
on-demand materialization (R5b) rather than a store property.**

Grounds, in order: R3 (provenance as a plain, indexable side table — the query
shape the product is *for*), R8 (FTS5 in the same transaction, no second engine
to keep consistent), inspectability under spec-driven development, and a SQL
escape hatch. RR1 no longer opposes it; RR2 is retired; RR3 is small.

Implementation stance, unchanged:

- Define a **`QuadStore` port** in Phase 2 — the mapping engine and query layer
  talk to an interface, never to SQL. Backend swap stays a one-module change.
  **This survives the lean and is not optional**; it is what keeps the downside
  capped per R6.
- Ship **E (in-memory)** first as the reference implementation; it is the
  simplest thing that satisfies R1–R6 at typical vault size and it makes the
  port real by construction.
- Keep **B (Oxigraph, native build)** documented as the escape route.

### 7a. Tripwire — the condition that reverses this

> **If we find ourselves writing a general BGP→SQL compiler, a cost-based join
> planner, or a query-language parser, stop.** That is the signal that R5a was
> under-specified and we are re-deriving SPARQL badly. Mount Oxigraph (B) behind
> the `QuadStore` port instead.

R5a is deliberately a **fixed, small set of named operations**, not a general
query surface. Growth in the *number* of operations is fine. Growth toward
*arbitrary user-supplied patterns* is the tripwire. Naming the failure condition
in advance is what keeps this from becoming a decision we drift past.

## 8. Consequences

- `spec/02-data-model.md` stays **storage-agnostic**: identity/IRI rules, the
  Markdown→quads mapping, the term/provenance *logical* model, and the
  `QuadStore` port. It does not depend on this ADR either way — Phase 1 is
  unblocked regardless.
- `spec/04-index-store.md` carries the physical schema, taking §5d as its
  starting point, and is written at Phase 3 entry rather than waiting for
  closure.
- **Layer 2 is re-scoped.** "Grow toward SPARQL" is replaced by "a bounded
  traversal API (R5a) plus RDF materialization for external engines (R5b)."
  `spec/00-vision.md` §5, `PLAN.md` §3/§4 updated accordingly.
- **The riskiest open design question is no longer the backend.** It is
  **predicate vocabulary design** — per §4a(ii)1, vocabulary is what determines
  whether an AI can actually use this graph. That work lives in `spec/01` and
  `spec/02`, and deserves the scrutiny this question was getting.
