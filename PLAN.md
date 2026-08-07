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
  behind a `QuadStore` port and **which backend is still an open decision**
  (`spec/adr/0001-quad-store-backend.md`) — SQLite was an inherited assumption,
  never a decision.
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
Layer 1  Parser + incremental indexer        → quad store (+ provenance)  [backend OPEN: ADR-0001]
Layer 2  Query engine (start lightweight; grow toward SPARQL)
Layer 3  Faces — thin CLIENTS of the core; none owns an index (§2):
         ├─ MCP server       → the AI face: expose the graph to Claude   ← primary
         ├─ CLI              → headless index/query, no editor required  ← primary
         ├─ LDP HTTP server  → external / interop face (W3C LDP)
         └─ Obsidian plugin  → authoring + live graph views + predicate autocomplete
```

The core runs **headless** and watches the **filesystem**, so a vault edited by
an AI agent, a CLI, or any Markdown editor indexes identically.

Stack (assumed; confirm): **TypeScript / Node**, yarn. RDF libs TBD
(candidates: N3.js, rdf-ext; Comunica if/when SPARQL). Dependency-light bias.

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
- [ ] `spec/02-data-model.md` — IRI/identity, Markdown→RDF mapping, `QuadStore`
      port. **Storage-agnostic** — no physical schema (see ADR-0001)
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
- Entry: **close ADR-0001** — run the §6 benchmark against candidates (SQLite,
  Oxigraph, in-memory), settle "does the Obsidian plugin own a store?", then
  write `spec/04-index-store.md` with the chosen physical schema **and a
  published scale envelope** (tested vault sizes + the point where we tell the
  user "beyond here, use X"). No store code before the ADR closes.
- [ ] Persistent `QuadStore` implementation on the chosen backend (+ provenance)
- [ ] Incremental indexer: **filesystem** change → re-parse → drop-and-replace
      graph; watch mode. No editor-specific event source.
- [ ] Query layer v1 (pattern/graph queries); SPARQL later
- [ ] Scale-envelope numbers documented in `spec/04` and surfaced in the README
- Exit: reconcile spec; log deltas.

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

Blocking Phase 3 (benchmark-gated, does **not** block Phase 1 or 2):
- [ ] **Quad store backend** — `spec/adr/0001-quad-store-backend.md`. SQLite was
      an inherited assumption, not a decision. Analysis so far: **scale is not
      the risk** (SQLite covers ~10M quads; a large vault is ~1–2M). The real
      risks are (a) SPARQL is a multi-month build on a hand-rolled SQL schema
      and (b) RDF-star terms are fiddly in SQL. *(The Electron/native-module risk
      is retired — the plugin no longer embeds a store.)* Now a two-horse race:
      **SQLite** (control, FTS5, SQL escape hatch, plain-table provenance) vs.
      **Oxigraph** (SPARQL 1.1 + RDF-star free, provenance modeled as quads, no
      escape hatch). Closes on measured numbers, not argument.
- [ ] Client↔core transport (in-process / local HTTP / IPC). Small; not gating.

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
| `spec/02-data-model.md` | IRI/identity, RDF mapping, `QuadStore` port (storage-agnostic) | to write ← **next** |
| `spec/03-ldp-http.md` | LDP resources/containers/verbs/conformance | to write |
| `spec/04-index-store.md` | Physical store schema, indexer, scale envelope | after ADR-0001 |
| `spec/adr/0001-quad-store-backend.md` | Which quad store backend + its limits | **OPEN** (benchmark-gated) |

---

## 9. Changelog

- **2026-08-07 — ▶ RESUME HERE. Store backend re-opened; `spec/02` is next.**
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
