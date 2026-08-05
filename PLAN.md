# my-ldp — Project Plan

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
- **Markdown is the source of truth.** SQLite is a derived, rebuildable index —
  never authoritative.
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
Layer 1  Parser + incremental indexer        → SQLite quad store (+ provenance)
Layer 2  Query engine (start lightweight; grow toward SPARQL)
Layer 3  Faces (thin adapters over Layers 0–2):
         ├─ LDP HTTP server  → external / interop face (W3C LDP)
         ├─ Obsidian plugin  → authoring + live graph views + predicate autocomplete
         └─ MCP server       → the AI face: expose the graph to Claude
```

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
- [ ] `spec/02-data-model.md` — IRI/identity, Markdown→RDF mapping, SQLite schema
- [ ] `spec/03-ldp-http.md` — LDP resources/containers/verbs/conformance target
- [ ] Resolve the four **blocking decisions** (§7): stack, IRI scheme, identity
      default, LDP conformance target
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
- [ ] In-memory graph model + provenance records
- [ ] Golden-file tests: fixture notes → expected Turtle
- Exit: reconcile `spec/02` to the implementation; log deltas.

### Phase 3 — Index & query
- Entry: spec the SQLite schema + query surface (extend `spec/02` or new doc).
- [ ] SQLite quad store schema (+ provenance table)
- [ ] Incremental indexer: file change → re-parse → diff → upsert; watch mode
- [ ] Query layer v1 (pattern/graph queries); SPARQL later
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
- [ ] **MCP server** over the graph (query + cite) — likely highest value first
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
| `spec/01-triple-authoring-syntax.md` | Human authoring surface | draft v0.1 |
| `spec/02-data-model.md` | IRI/identity, RDF mapping, SQLite schema | to write |
| `spec/03-ldp-http.md` | LDP resources/containers/verbs/conformance | to write |
| `spec/adr/` | Architecture Decision Records | as needed |

---

## 9. Changelog

- **2026-08-04** — Adopted a **quad store / named graphs**; granularity closed:
  **note-as-graph**, vault = dataset + IRI base. Ripples: store is `(s,p,o,g)`;
  graph name = authorship provenance; file change = drop-and-replace note graph;
  TriG/N-Quads for dumps; RDF-star × quads flagged for the data-model spec.
- **2026-08-04** — Reworked plan: Phase 1 is now **Design & Specification** with
  a **Definition of Ready** bar and a recurring **spec-review gate** bracketing
  every build phase. Locked earlier: library-first build order; `(( ))`
  delimiter; tags-left-alone. Authoring mini-spec drafted (`spec/01`).
