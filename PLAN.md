# markdown-ldp — Project Plan

A living plan. Update it as decisions land and phases complete. Newest status at
the top of the Changelog (§9).

**How this project runs:** design first, then build in stages — and **specs are
gated, not one-shot.** Every build stage is bracketed by a spec-review pass
(§5): we scrutinize and update the relevant spec *before* building against it,
and reconcile the spec to reality *after*. Implementation never runs ahead of an
agreed spec.

---

## 1. Vision

Turn a folder of Markdown notes (starting with an Obsidian vault) into a real
**knowledge graph** — moving authors away from dumb `a → b` links and toward
formal **subject–predicate–object** statements with defined meaning, so that
**AI can reason over the vault** (traverse typed relationships, cite evidence,
answer connective questions) instead of grepping fuzzy text.

**Linked Data Platform (LDP) conformance is a means, not the end.** It gives us
a principled read/write resource model and external interop credibility. The
end is a trustworthy, queryable, AI-legible graph.

North-star scenario:
> *"What did Einstein develop, with what evidence, and how does it connect to
> notes I wrote last week?"* — answered from a typed graph with provenance, not
> full-text search.

---

## 2. Principles & locked decisions

- **Human-first, RDF-hidden (north-star principle; breaks ties).** We strive for
  maximum readability, writability, and ease of use in plain Markdown. Authors
  must be able to write and read meaningful links **without understanding RDF,
  IRIs, CURIEs, or Linked Data concepts.** Notes look like notes; the RDF/LDP
  machinery is a managed substrate, never a literacy tax. Full IRIs/CURIEs are an
  optional power-user layer. When two designs conflict, the more layman-friendly
  one wins. (We explicitly reject "looks like gobbledygook" syntaxes that surface
  raw IRIs/prefixes.)
- **Markdown is the source of truth.** The quad store is a derived, rebuildable
  index — never authoritative. Because it is a *cache*, the backend is swappable
  behind a `QuadStore` port. Backend **leans SQLite**
  (`spec/adr/0001-quad-store-backend.md`) — reached on analysis, not inherited
  from the first sketch: provenance as a plain side table (R3) and FTS5 in the
  same transaction (R8) are what decide it.
- **We keep RDF; we do not build SPARQL.** The RDF *data model* (IRIs, named
  graphs, quoted triples) is load-bearing. SPARQL is one *language* over it, and
  a general endpoint is a poor AI surface — models hallucinate predicates rather
  than exhaust expressiveness, and empty results read as "false" when they mean
  "not asserted." Layer 2 is a **bounded, cited traversal API**; full SPARQL is
  available by **materializing quads into an in-memory RDF engine on demand**.
  *Tripwire: writing a join planner or query parser means stop and mount
  Oxigraph behind the port (ADR-0001 §7a).*
- **Quads, not triples — named graphs are first-class.** The store is a **quad
  store** `(s, p, o, g)`. **Each note is a named graph** (named by its IRI); the
  **vault is the dataset** (identity + IRI base). Consequences: maps 1:1 to LDP
  resources (`GET /note` → that note's graph as Turtle); the **graph name = the
  document a statement was authored in** → authorship provenance, distinct from
  what the statement is *about*; file change = **drop-and-replace that note's
  graph**; the "vault graph" is the union of all note-graphs.
- **Works on plain Markdown.** Obsidian conventions are the starting dialect,
  not a hard dependency. No Obsidian required to *parse* a vault.
- **Predicates carry the formal semantics.** Documents are the subjects and
  objects. Tags stay free (no triples by default; a dedicated SKOS layer later).
- **The ontology lives in the vault as notes** — predicate-notes and class-notes
  are authored like any other note; templates are class constructors.
- **Provenance always.** Every triple traces to `(file, line, span)`; duplicate
  assertions collapse but retain all source spans.
- **Library first, thin faces after.** One reusable semantic core; the HTTP
  server, Obsidian plugin, and MCP server are adapters over it.
- **Specs are gated (§5).** Design precedes build; specs are reviewed before and
  reconciled after each stage.

Authoring syntax (locked; see `spec/01-triple-authoring-syntax.md`):
- Note-as-subject via frontmatter + `key:: value` inline fields.
- Inline statements via `[[S]] ((predicate)) [[O]]`.
- Bulk via ` ```triple ` blocks (Turtle-flavored).
- Statement-level metadata via trailing `(...)` → RDF-star.

---

## 3. Architecture

```
Layer 0  Mapping spec: Markdown constructs  ⇄  RDF        (tool-agnostic core rules)
Layer 1  Parser + incremental indexer        → quad store (+ provenance)  [SQLite, leaning: ADR-0001]
Layer 2  Query layer: bounded, cited traversal API
         (+ on-demand RDF materialization for external SPARQL engines)
Layer 3  Faces — thin CLIENTS of the core; none owns an index (§2):
         ├─ MCP server       → the AI face: expose the graph to Claude   ← primary
         ├─ CLI              → headless index/query, no editor required  ← primary
         ├─ LDP HTTP server  → external / interop face (W3C LDP)
         └─ Obsidian plugin  → authoring + live graph views + predicate autocomplete
```

The core runs **headless** and watches the **filesystem**, so a vault edited by
an AI agent, a CLI, or any Markdown editor indexes identically.

Stack (assumed; confirm): **TypeScript / Node**, yarn. RDF libs TBD
(candidates: N3.js, rdf-ext; Oxigraph or Comunica as the on-demand SPARQL hatch
only). Dependency-light bias.

---

## 4. Phased roadmap

Each phase ends with something concrete and reviewable. Every **Build** phase is
bracketed by the **spec-review gate** (§5): `Entry` scrutinizes/updates the
spec; `Exit` reconciles the spec to what was actually built.

### Phase 1 — Design & Specification  ← *current*

Produce a spec set complete enough to build from — meeting the **Definition of
Ready** (§6). This is the design work we are doing now.

- [x] `spec/01-triple-authoring-syntax.md` — authoring surface (draft v0.1)
- [x] `PLAN.md` — this roadmap (living)
- [x] `spec/00-vision.md` — anchor: why, architecture, faces, decision log
      (draft v0.1)
- [x] `spec/02-data-model.md` — IRI/identity, the **vocabulary layer**,
      Markdown→RDF mapping, provenance, `QuadStore` port (draft v0.1).
      **Storage-agnostic** — no physical schema (see ADR-0001)
- [ ] `spec/03-ldp-http.md` — LDP resources/containers/verbs/conformance target
- [x] `spec/adr/0001-quad-store-backend.md` — backend question **opened** and
      framed; requirements R1–R8, scale envelope, candidates, benchmark gate
- [~] **Blocking decisions** (§7): IRI scheme, identity default, CURIEs **closed**;
      remaining — stack/monorepo confirm, LDP conformance target
- [ ] Repo scaffolding decisions recorded (monorepo layout, test-vault strategy)
- [ ] **Spec-review gate:** full read-through against the Definition of Ready →
      declare **spec-complete for the core** before any Phase 2 code

*Exit criterion:* specs 00–02 pass the Definition of Ready; blocking decisions
closed; a person could implement Phase 2 from the docs alone.

### Phase 2 — Semantic core (the library)
- Entry: review/finalize `spec/02-data-model.md` (mapping + IRI rules).
- [ ] Markdown parser → AST (frontmatter, inline fields, `(( ))`, `triple` blocks)
- [ ] Mapping engine: AST → canonical triples
- [ ] IRI minting + identity resolution (path/name + optional stable `id:`)
- [ ] **`QuadStore` port** + in-memory reference implementation + provenance records
- [ ] Golden-file tests: fixture notes → expected Turtle
- [ ] **Synthetic vault generator** (1k/10k/50k notes × light/typical/dense) —
      feeds the ADR-0001 benchmark
- Exit: reconcile `spec/02` to the implementation; log deltas.

### Phase 3 — Index & query
- Entry: write `spec/04-index-store.md` from the ADR-0001 §5d physical sketch
  (dictionary-encoded terms, quad table, permutation covering indexes,
  provenance side table, FTS5). No longer blocked on an engine bake-off — the
  ADR leans SQLite and the remaining gate is measurement, moved to Exit.
- [ ] Persistent `QuadStore` implementation on SQLite (+ provenance, FTS5)
- [ ] Incremental indexer: **filesystem** change → re-parse → drop-and-replace
      graph; watch mode. No editor-specific event source.
- [ ] Query layer v1 — the **fixed set** of bounded traversal operations (R5a).
      Adding operations is fine; accepting arbitrary user patterns is the
      tripwire (ADR-0001 §7a).
- [ ] R5b hatch: materialize a subgraph → in-memory RDF engine → run one real
      SPARQL 1.1 query. Validation that the hatch exists; not a component.
- [ ] Prototype the two hard bits: RDF-star terms (R4) and multi-span
      provenance (R3)
- Exit: **close ADR-0001** — run the reduced §6 measurement (SQLite + in-memory)
  on the synthetic vaults, **publish the scale envelope** in `spec/04` and the
  README (tested sizes + the point where we tell the user "beyond here, use X").
  Reconcile spec; log deltas.

### Phase 4 — Schema & validation
- Entry: spec class-note/predicate-note recognition + shape rules.
- [ ] Class-notes / predicate-notes (`rdf: class` / `rdf: property`)
- [ ] Shape validation (advisory first): required/allowed predicates, ranges
- [ ] Optional SHACL emission (decision pending)
- [ ] Templates-as-classes conventions + example template set
- Exit: reconcile spec; log deltas.

### Phase 5 — Faces
- Entry: `spec/03-ldp-http.md` finalized; MCP + plugin surface specs drafted.
- [ ] **MCP server** over the graph (query + cite) — **the primary face**
- [ ] **CLI**: index / query / dump a folder headlessly, no editor involved
- [ ] **LDP HTTP server**: resources/containers, content negotiation, read path
- [ ] LDP write path (PUT/POST/PATCH) + Markdown round-trip strategy
- [ ] **Obsidian plugin**: predicate autocomplete, statement rendering, graph view
- Exit: reconcile specs; log deltas.

### Phase 6 — SKOS & AI curation
- Entry: spec the SKOS layer + AI-curation loop.
- [ ] Concept-notes (`skos:Concept`, broader/narrower/related)
- [ ] SKOS-centric tagging UI for Obsidian (separate from free `#tags`)
- [ ] AI-proposes-triples / human-curates loop (accept/reject inferred links)
- Exit: reconcile specs; log deltas.

---

## 5. The spec-review gate (recurring practice)

Run at the boundary of every build phase. Lightweight but non-optional.

**Entry review (before building a phase):**
1. Re-read the phase's governing spec end-to-end.
2. Stress-test it with 2–3 concrete worked examples / edge cases.
3. Resolve any `[DECIDE]`/open items the phase depends on.
4. Confirm it meets the Definition of Ready (§6) for that phase's scope.

**Exit reconciliation (after building a phase):**
1. Diff *intended* spec vs *actual* implementation.
2. Update the spec to match reality (or file an ADR if we changed direction).
3. Record deltas in the Changelog (§9); tick the roadmap boxes.

**Cadence:** at minimum at each phase boundary. Also whenever a build discovery
invalidates an assumption — stop, update the spec, then continue.

---

## 6. Definition of Ready (spec-complete bar)

A spec is "ready to build from" when:
- [ ] Every normative rule uses clear MUST/SHOULD/MAY language.
- [ ] At least one **worked example** exists per non-trivial rule (input → output).
- [ ] Edge cases and error/ambiguity handling are stated, not implied.
- [ ] No unresolved `[DECIDE]` that the target phase depends on.
- [ ] Identity/IRI rules are concrete enough to implement without guessing.
- [ ] A reviewer who didn't write it could implement the phase from the doc alone.

---

## 7. Open decisions (rollup)

Blocking (close during Phase 1):
- [ ] Confirm stack: TypeScript/Node + yarn; monorepo tool (workspaces? turbo?).
- [ ] LDP conformance target: full W3C LDP 1.0 vs "LDP-inspired."
- [ ] **Product name** — repo is *markdown-ldp*; docs now say the same. Confirm.

Leaning, safe to spec and build against (formal close at Phase 3 exit):
- [~] **Quad store backend → SQLite** — `spec/adr/0001-quad-store-backend.md`.
      Neither scale nor speed decided it (both are non-issues; speed is
      invisible behind an LLM tool call). **R3 and R8 decided it**: provenance as
      a plain indexable side table, and FTS5 in the same transaction as the
      graph — the only candidate satisfying both in one file. Plus
      inspectability, which matters under spec-driven development. The argument
      that had opposed it (SPARQL build cost) **dissolved** once R5 was split.
      Remaining gate is measurement + a published scale envelope, not a choice.
- [ ] Client↔core transport (in-process / local HTTP / IPC). Small; not gating.

Closed — vocabulary layer (2026-08-09):
- [x] **Established vocabularies are a mapping target, never the authoring
      surface.** Author writes `((developed))`; the predicate-note carries
      `subPropertyOf: schema:creator (inverted)`. `((schema:creator))` as the
      normal way to write would violate Human-first outright.
- [x] **AI in the curation loop, never the query loop.** An AI *proposes* an
      alignment; a human accepts; the result is written into the predicate-note
      as a **durable Markdown fact**. Thereafter resolution is deterministic —
      git-diffable, reversible, golden-file testable, offline, zero per-query
      cost. Decisive reason: **you cannot cite a fuzzy match**, and citation is
      the product. Corollary: **no normalization at index time either** —
      indexing MUST stay a pure function of vault + committed vocabulary.
- [x] **`subPropertyOf` beats equivalence.** `developed` is *narrower* than
      `schema:creator`, not equal to it. Downward-closed transitive expansion
      gives sound recall on the broad term and precision on the narrow one, with
      nothing overstated. (This is also the one SPARQL capability worth having —
      and it's a recursive CTE.)
- [x] **Alignments carry direction.** `(( ))` is subject-first and
      sentence-shaped; schema.org is noun-shaped and usually points the other
      way, and defines almost no inverses. Hence the `(inverted)` marker.
- [x] **Inverses resolved at query time**, never materialized — half the
      storage, no R2 consistency burden, and a materialized inverse quad's
      provenance would be a lie.
- [x] **CiTO adopted** for the epistemic layer (`supports`, `disagreesWith`,
      `citesAsEvidence`). Schema.org is web-publishing shaped and has nothing
      here; vault-local terms would have nothing to align *up to*.
- [x] **Starter pack ships** — ~40–60 pre-aligned predicate-notes. Not
      convenience: it **seeds the hierarchy** so the first curation pass has
      something to attach to. Opt-in, ordinary Markdown, never special-cased.
- [x] **MCP emits both the human label and the canonical IRI** in every result —
      the word the model can read plus the IRI it memorized in pretraining.
- [x] Also closed in `spec/02`: percent-encoding (not `_` substitution) in IRIs;
      link-resolution vs IRI-derivation separated; conservative datatype
      inference; comma-splitting rule; predicate/class notes found by frontmatter
      marker anywhere; external link labels not `rdfs:label`.

Closed (this session):
- [x] **SPARQL is not a store requirement.** R5 split: **R5a** a fixed, bounded,
      cited traversal API (the product surface) + **R5b** materialize any
      subgraph into an in-memory RDF engine for real SPARQL on demand (interop).
      Keeps the RDF data model, drops the compiler. Tripwire recorded (§7a).
- [x] **Embedded KV rejected** (LMDB/RocksDB; Redis rejected separately as a
      *server*, and FalkorDB as a *property* graph). The permutation-index
      design is legitimate — it is how Jena TDB and RDF4J work — and it makes R2
      a prefix range delete. But it has no FTS (R8 becomes a second engine to
      keep consistent — RR4 by the back door), no natural home for R3, and no
      inspectability. **Its core idea is adopted inside SQLite** (ADR-0001 §5d):
      dictionary-encoded terms + permutation covering indexes = the same prefix
      range-scan primitive, with a planner and `SELECT` for free. Retained as a
      future option for the bulk-import outlier.

Closed:
- [x] **IRI base scheme → configurable base, `https://` default, stored
      relative.** Note identity is a **vault-relative reference** resolved
      against a configurable base IRI only at the edges (serialization, LDP);
      `https://` default keeps the LDP face a no-op translation and gives free
      relocatability. Unconfigured base → reserved placeholder
      `https://vault.local/` (never blocks an offline layman; power users
      override). Rejected `urn:`/`vault:` (not LDP-native, poor CURIE ergonomics).
      (2026-08-04)
- [x] **Identity default → name/path derived; stable `id:` wins when present.**
      Default IRI derives from a normalized vault-unique note name/path; a
      frontmatter `id:` overrides and makes identity rename-proof. **The tool
      mints ids, never the human** — minted silently when a note is promoted to
      a predicate/class or an anchor is needed. Aligns with Obsidian's
      link-by-name + auto-rename and with Human-first (§2). (2026-08-04)
- [x] **The core owns the store; clients query it. No client embeds an index.**
      Obsidian is **one optional client dialect**, not the platform — users may
      use other Markdown tools, and the near-term trajectory is a user working a
      plain folder **entirely through an AI, with no Markdown client at all**. A
      face that may not exist cannot dictate the storage engine. Consequences:
      the core MUST run **headless** (library + optional local daemon); the
      watcher MUST be **filesystem-level, never Obsidian's event API** (AI
      agents, CLIs, and sync clients all write files); the plugin is a **thin
      client** over the same interface MCP and HTTP use; **MCP + CLI are the
      primary faces**. Also retires the Electron-native-module constraint, so
      SQLite *and* Oxigraph re-open for ADR-0001. (2026-08-07)
- [x] **CURIEs → adopted for vocabulary + serialization, NOT as identity.** A
      vault **prefix-map note** (`dct:`, `schema:`, `rdfs:`, `skos:`, + the
      vault's own prefix) drives predicate/class resolution, note-IRI
      abbreviation, and Turtle `@base` — one map, three jobs. CURIEs are a
      tool-hidden convenience (author writes `((developed))`, not `schema:…`);
      full IRIs/CURIEs are an opt-in power-user layer (progressive disclosure).
      (2026-08-04)
- [x] **Named-graph granularity → note-as-graph.** Vault = dataset/IRI-base.
      (2026-08-04)

Deferrable (from `spec/01`):
- [ ] Literal datatype inference aggressiveness.
- [ ] Accept raw ` ```turtle ` blocks alongside ` ```triple `.
- [ ] Validation strictness (advisory vs blocking) + SHACL emission.
- [ ] Predicate/class notes: reserved folders vs frontmatter marker anywhere.

---

## 8. Spec artifacts (index & status)

| Doc | Purpose | Status |
|-----|---------|--------|
| `PLAN.md` | This roadmap | living |
| `spec/00-vision.md` | Anchor: why + architecture + decisions | draft v0.1 |
| `spec/01-triple-authoring-syntax.md` | Human authoring surface | **draft v0.2** (scrutinized) |
| `spec/02-data-model.md` | IRI/identity, **vocabulary layer**, RDF mapping, provenance, `QuadStore` port | **draft v0.1** ← review next |
| `spec/03-ldp-http.md` | LDP resources/containers/verbs/conformance | to write |
| `spec/04-index-store.md` | Physical store schema, indexer, scale envelope | Phase 3 entry (from ADR-0001 §5d) |
| `spec/adr/0001-quad-store-backend.md` | Backend, the RDF/SPARQL split, documented limits | **LEANING SQLite** (closes Phase 3 exit) |

---

## 9. Changelog

- **2026-08-09 — ▶ RESUME HERE. Backend leans SQLite; SPARQL demoted. `spec/02`
  is still the next artifact to write.**
  - **The requirement was wrong, not the backend.** `spec/00`/`PLAN` conflated
    the RDF **data model** with **SPARQL the query language**. They are
    separable. Keeping RDF is load-bearing (note-as-graph, `GET /note` → Turtle,
    exportability); building SPARQL is not. R5 split into **R5a** (a fixed,
    bounded, provenance-carrying traversal API — the actual product surface) and
    **R5b** (materialize any subgraph into an in-memory RDF engine for real
    SPARQL 1.1 on demand — interop, ~1s at our scale, because R6 makes the store
    a cache). This **dissolves RR1**, the multi-month BGP→SQL compiler that was
    the strongest argument against SQLite.
  - **A general SPARQL endpoint is also the wrong AI surface, not just a costly
    one.** LLMs emit valid SPARQL and hallucinate *predicates* — the bottleneck
    is vocabulary, not expressiveness. Empty results mean "not asserted" but
    read to a model as "false." Unbounded queries blow the context window. And
    the product's differentiator is **citation**, a provenance-join — the thing
    RDF engines model worst.
  - **Embedded KV (LMDB/RocksDB) considered and rejected** as candidate F;
    Redis rejected separately (a *server*, not embedded; FalkorDB is a
    *property* graph). The permutation-index design is the classical
    triplestore architecture and makes R2 a prefix range delete — but no FTS
    (R8 becomes a second engine to keep consistent), no home for R3, no
    inspectability. **Its idea is adopted inside SQLite** (§5d).
  - **Leaning candidate A — SQLite** (§5d): dictionary-encoded terms,
    four-integer quad table, permutation covering indexes, provenance side
    table, FTS5 in the same database. Decided on **R3 + R8 + inspectability** —
    explicitly *not* on scale or speed, both of which are non-issues (query
    latency is invisible behind an LLM tool call round-trip).
  - **Tripwire recorded (§7a):** if we start writing a join planner, a BGP
    compiler, or a query parser, stop and mount Oxigraph behind the
    `QuadStore` port. The port stays mandatory in Phase 2.
  - **Phase 3 unblocked and resequenced.** The ADR gate shrank from an engine
    bake-off to a scale-envelope *measurement*, moved from Phase 3 **entry** to
    Phase 3 **exit**. `spec/04` can now be written at entry from §5d.
  - **The riskiest open question is no longer the backend — it is predicate
    vocabulary design.** Addressed same day; see below.
  - **`spec/02-data-model.md` written (draft v0.1)** — identity/IRIs, the
    vocabulary layer, the full Markdown→quads mapping, provenance, and the
    `QuadStore` port. Closes six `spec/01` `[DECIDE]`s in their natural home.
  - **Vocabulary layer settled** (full list in §7). The frame: free-form minting
    stays mandatory (Human-first), and the failure it causes is **recall through
    fragmentation**, not comprehension — `developed`/`created`/`authored` as
    five unrelated predicates make a query miss four of them *confidently, with
    citations*. Fix is **alignment between predicates**, committed as durable
    Markdown by a human, expanded deterministically at query time. Schema.org is
    the target vocabulary chiefly because **LLMs already know it from
    pretraining**, which attacks the vocabulary bottleneck in ADR-0001 §4a(ii)
    directly.
  - **Next best step:** review `spec/02` against the Definition of Ready (§6),
    then the Phase-1 spec-review gate. `spec/03-ldp-http.md` is the last
    Phase-1 artifact; the LDP conformance target and stack/monorepo confirm
    remain the blocking decisions.

- **2026-08-07 — Store backend re-opened as ADR-0001; core owns the store.**
  - **SQLite was never decided** — it was an assumption inherited from the first
    sketch and had hardened into prose across `spec/00`, `PLAN`, and `README`.
    Re-opened as **ADR-0001** and struck from all three as settled fact.
  - **The scale worry resolves, but the framing changes.** Estimated envelope:
    a serious vault is ~10k–300k quads, a large one ~1–2M, ~10M only under bulk
    import. SQLite handles that comfortably (~250 MB at 1M quads with covering
    indexes). **Capacity is not the risk.** The real risks are SPARQL build cost
    on a hand-rolled schema, native-SQLite vs. the Obsidian plugin, and RDF-star
    terms in SQL. Recorded with requirements R1–R8 and five candidates.
  - **Decision is benchmark-gated, not argument-gated** (ADR-0001 §6): synthetic
    vault generator → measure index/re-index/query/startup per candidate →
    **publish a scale envelope with the tested limits.** Stated limits are a
    deliverable.
  - **Mitigation now, so the question can't block us:** a `QuadStore` port lands
    in Phase 2 with an in-memory reference implementation; `spec/02` is written
    **storage-agnostic**; physical schema moves to a new `spec/04-index-store.md`
    written after the ADR closes. Phase 1 and 2 are unblocked.
  - **New locked decision — the core owns the store; clients query it.** Obsidian
    is one optional client dialect, not the platform; the near-term user works a
    plain folder **entirely through an AI, with no Markdown client at all**. So:
    core runs **headless**, watcher is **filesystem-level** (never Obsidian's
    event API), plugin is a thin client, **MCP + CLI are the primary faces**
    (CLI added to Phase 5). This also retires the Electron-native-module
    constraint — SQLite *and* Oxigraph are back in contention, and ADR-0001
    reduces to **A vs. B on the benchmark**.
  - **Next best step (unchanged, now safe to take):** write `spec/02-data-model.md`.
  - Product name settled to **markdown-ldp** across docs.
  - *(Superseded 2026-08-09: the A-vs-B benchmark race described here no longer
    runs — RR1 dissolved and the ADR leans SQLite. The scale-envelope
    deliverable survives.)*

- **2026-08-04 (eve)**
  - **Where we left off:** `spec/01` is at **v0.2**, fully scrutinized
    (writability, narrative-blend, Layer A frontmatter hygiene, §8 correctness).
    `spec/00` + this plan reconciled to match. Three blocking decisions **closed**
    (IRI scheme, identity default, CURIEs); **Human-first, RDF-hidden** recorded
    as the tie-breaking north-star principle.
  - **Next best step:** write **`spec/02-data-model.md`** — the last Phase-1 spec
    gating any code. Everything just decided feeds it: relative-IRI identity +
    configurable base, the vault **prefix-map** (CURIEs), external IRIs, key/predicate
    slugging, datatype inference, and dedupe/provenance **quads** `(s,p,o,g)`.
    Writing it will also force-close several small `[DECIDE]`s in their natural
    home (see `spec/01` §10 "Still open").
  - **Also open (not blocking `spec/02`):** confirm stack/monorepo; LDP conformance
    target; **product name** — `spec/00`/`PLAN` still say *my-ldp* but the repo is
    *markdown-ldp*; pick one.
  - **Two `spec/01` bugs fixed this session:** frontmatter now has a reserved-key
    denylist (was minting config like `tags`/`cssclasses` as triples); `rdf:type`
    is multi-valued (the old "typing precedence, highest wins" wrongly discarded
    valid types).
  - **Authoring decisions locked this session:** blend model = both-layered;
    keep `(( ))` + implicit-subject `::` + three-link shorthand; maturity ladder
    M1→M2→M3 (build M1 first); statement-metadata token `~( … )`; external
    Markdown links are IRIs; `triple`/Turtle blocks are a power-user layer.

- **2026-08-04** — Adopted a **quad store / named graphs**; granularity closed:
  **note-as-graph**, vault = dataset + IRI base. Ripples: store is `(s,p,o,g)`;
  graph name = authorship provenance; file change = drop-and-replace note graph;
  TriG/N-Quads for dumps; RDF-star × quads flagged for the data-model spec.
- **2026-08-04** — Reworked plan: Phase 1 is now **Design & Specification** with
  a **Definition of Ready** bar and a recurring **spec-review gate** bracketing
  every build phase. Locked earlier: library-first build order; `(( ))`
  delimiter; tags-left-alone. Authoring mini-spec drafted (`spec/01`).
