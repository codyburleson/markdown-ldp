# Data Model — Identity, Vocabulary, Mapping & the Store Port (DRAFT v0.2)

Status: **Draft / for review.** This is the last Phase-1 spec and the one every
line of Phase-2 code is written against. It is **storage-agnostic**: no physical
schema, no SQL. The physical schema lives in `spec/04-index-store.md` (see
`spec/adr/0001-quad-store-backend.md` §5d).

**v0.2 revision (2026-08-10):** first-principles scrutiny pass. Four defects
that would have blocked Phase 2 are fixed and three new ADRs opened. Summary:
identity is now **always vault-local** (`id:` may no longer be an absolute URI;
external identity is a `sameAs:` *assertion*, §3.2); §3.4's reversibility MUST is
**scoped to path-derived IRIs**, since it was already false for every
predicate-note; predicate resolution is **one function for all authoring forms**,
closing a split that gave `(( ))` and three-link form different IRIs (§5.10,
§6.2); alignment fields now have a **lowering table** and direction-composition
rules (§5.3, §5.4, ADR-0002); the reserved-key denylist is **extended to
tool-configuration keys** so `rdf:`/`id:`/`prefixes:`/`datatype:` stop minting
triples (§6.1); and the `QuadStore` port's `replaceGraph` is **restructured** so
it no longer depends on JavaScript reference identity (§10, ADR-0003).

Governing constraint throughout: **Human-first, RDF-hidden**
(`00-vision.md` §3, `PLAN.md` §2). Where two mappings are defensible, the one a
layman would predict wins.

Related: `01-triple-authoring-syntax.md` (the authoring surface this maps *from*),
`03-ldp-http.md` (the HTTP face this maps *to*), ADR-0001 (the store), **ADR-0002
(vocabulary storage), ADR-0003 (canonical identity), ADR-0004 (`domain`/`range`)**.

---

## 1. Scope

| In scope | Out of scope |
|---|---|
| IRI minting, note identity, normalization | Physical store schema (`spec/04`) |
| The prefix map | LDP verbs & conformance (`spec/03`) |
| The **vocabulary layer** — predicate resolution, alignment, curation | Authoring syntax itself (`spec/01`) |
| Markdown → quads mapping, construct by construct | SHACL emission (Phase 4) |
| Literal & datatype rules | SKOS concepts (Phase 6) |
| RDF-star lowering | Query language surface (`spec/04` / Phase 3) |
| The provenance model | |
| Canonicalization & dedupe | |
| The `QuadStore` port | |

Normative keywords MUST / SHOULD / MAY per RFC 2119.

---

## 2. The dataset

- The **vault** is an RDF **dataset** and the **IRI base**.
- Each **note** is a **named graph**, named by that note's IRI (`00-vision.md` §4).
- The **vault graph** is the union of all note-graphs.
- The store holds **quads** `(s, p, o, g)`.

### 2.1 A named subtlety: the same IRI plays two roles

`notes/Einstein.md` yields the IRI `⟨base⟩notes/Einstein`, which is used both as
**a subject** (the person Einstein) and as **a graph name** (statements authored
in that file). These are different things wearing one IRI.

This is deliberate and MUST be preserved: it is what makes `GET /notes/Einstein`
return exactly that note's graph.

**It is a choice, and it rests on Human-first — not on a standard's authority.**
An earlier draft defended it as *"the same conflation LDP makes between a
resource and its representation."* That is the wrong precedent: the conflation
here is **document-vs-thing** (a note *about* Einstein vs. Einstein himself),
which is a different and older problem than resource-vs-representation. The
honest justification is that forcing an author to distinguish "the note about
Einstein" from "Einstein" is exactly the literacy tax `00-vision.md` §3 rejects.
We take the conflation deliberately and pay its costs knowingly (see §3.2 on
`sameAs:`, where the distinction does resurface and must be respected).

Consequences that implementers MUST respect:

- The graph name records **where a statement was authored**, never what it is
  *about*. A statement about Einstein authored in `Relativity.md` lands in graph
  `⟨base⟩notes/Relativity`.
- Therefore **"the graph named X" and "the triples whose subject is X" are
  different queries**, and the MCP face MUST NOT conflate them. Both are needed:
  the first answers "what does this note assert?", the second "what do we know
  about this thing?"

---

## 3. Identity & IRIs

Closing the decisions logged in `PLAN.md` §7 (2026-08-04) into implementable rules.

### 3.1 Base IRI

- A vault MUST have a **base IRI**. It is configurable.
- Unconfigured, it MUST default to the reserved placeholder
  `https://vault.local/`. This never blocks an offline author; power users
  override it.
- The base MUST end in `/`.
- Note IRIs MUST be **stored vault-relative** in the index and resolved against
  the base only at the edges — serialization, LDP responses, external export.
  Rebasing a vault MUST therefore require no reindex.

### 3.2 Note IRIs — derivation

For a note at vault-relative path `P`:

1. **If frontmatter carries `id:`**, that value is the note's identity. It MUST
   be a **bare token** (no scheme, no `/`) → IRI = `⟨base⟩id/⟨token⟩`.
   `id:` makes identity **rename-proof** and MUST win over the path.
2. **Otherwise**, IRI = `⟨base⟩` + `P` with the `.md` extension removed and each
   path segment percent-encoded per §3.4.

**[DECIDED — v0.2] A note's IRI is ALWAYS minted under the vault's base.** An
`id:` MUST NOT be an absolute URI, and a value containing a scheme or a `/` MUST
be reported as a validation error rather than used.

An earlier draft allowed `id: https://www.wikidata.org/entity/Q937`, used
verbatim. That was never a logged decision — `PLAN.md` §7 (2026-08-04) closed
only *"name/path derived; stable `id:` wins when present; the tool mints ids"* —
and it contradicted four rules in this document at once: §3.1's *"stored
vault-relative… rebasing MUST require no reindex"*, §2's *"the vault is the
dataset and the IRI base"*, §3.4's decoding rule, and §3.3's *"the tool MUST NOT
ask the human"* (only a human types a Wikidata URL, and a raw IRI in frontmatter
is precisely the surface `00-vision.md` §3 rejects). It also made the LDP face
unable to serve the note at its own IRI — you cannot `GET` an IRI you do not
control.

**External identity is an assertion, not an identity.** To say a note is about a
resource that already has an IRI, use `sameAs:` — an ordinary mappable field:

```markdown
---
sameAs: https://www.wikidata.org/entity/Q937
---
```
→ `⟨N⟩ owl:sameAs ⟨https://www.wikidata.org/entity/Q937⟩ ⟨N⟩`

This is semantically correct (a note about Einstein is a document, not the
person), it is attributable and removable because it lands in the authoring
note's graph, `owl:` is already in the §4 prefix map, and it is what an external
consumer expects. Note the interaction with §2.1: because the note IRI is also a
graph name, a reasoner over an exported vault may conclude the *graph name* is
`sameAs` the external entity. That is a known cost of the §2.1 conflation and is
acceptable — `owl:sameAs` is advisory in every consumer we target.

Worked:

| Path / frontmatter | IRI (base `https://v.local/`) |
|---|---|
| `notes/Einstein.md` | `https://v.local/notes/Einstein` |
| `notes/Theory of Relativity.md` | `https://v.local/notes/Theory%20of%20Relativity` |
| `notes/E.md` with `id: einstein` | `https://v.local/id/einstein` |
| `notes/E.md` with `sameAs: https://…/Q937` | `https://v.local/notes/E`, plus an `owl:sameAs` quad |

**Accepted consequence — renaming changes a published IRI.** An ordinary note
has no `id:` (§3.3), so its IRI derives from its path. Renaming it changes that
IRI, and therefore its graph name. Internally this is harmless: incoming
`[[links]]` resolve by name (§3.5) and the store is a rebuildable cache
(`PLAN.md` §2). Externally it is not: the LDP face publishes IRIs that silently
change on rename, so an exported Turtle file or a citation an AI recorded last
week may dangle. Pinning an identity is what `id:` is for, and §3.3 already
mints one wherever the tool knows identity must survive.

### 3.3 The tool mints ids; the human never has to

Per the locked decision, `id:` is **written by the tool, silently**, not
requested from the author. The tool MUST mint an `id:` when:

- a note is promoted to a **predicate-note** or **class-note** (`rdf:` marker
  added) — vocabulary identity MUST survive renaming and reorganization; or
- an author explicitly asks to pin an identity.

The tool MUST NOT mint ids for ordinary notes. Minted ids SHOULD be a readable
slug of the current name, disambiguated with a short suffix on collision.

### 3.4 Normalization — percent-encode, never substitute

> **Correction to `spec/01` examples.** Illustrations there render
> `[[Theory of Relativity]]` as `ex:Theory_of_Relativity`. That underscore
> substitution is **lossy** — it makes `A B.md` and `A_B.md` collide, and it
> cannot be reversed to find the file on disk. Those renderings are
> *illustrative shorthand only and are not normative.*

Normative rules for deriving an IRI path from a vault path:

1. Strip the trailing `.md`.
2. Unicode-normalize each segment to **NFC**.
3. Percent-encode per RFC 3986 path-segment rules. `/` MUST remain a separator.
4. Do **not** case-fold. Do **not** substitute separators.

This is lossless and reversible **for path-derived IRIs**: for a note with no
`id:`, `GET` on its IRI recovers the file path by decoding alone.

**[CORRECTED — v0.2] Reversibility is a property of path-derived IRIs only, and
the LDP face MUST NOT depend on decoding.** An earlier draft stated the
reversibility requirement unconditionally. It was already false in this
document's own worked table: `notes/E.md` with `id: einstein` yields
`⟨base⟩id/einstein`, which does not decode to `notes/E.md`. And §3.3 *mandates*
minting an `id:` for every predicate-note and class-note — so the entire
vocabulary layer sits on IRIs that never decode.

The correct requirement: **the indexer MUST maintain a bidirectional
IRI ⇄ file-path map**, and the LDP face resolves through it. Decoding is an
optimization available on the common path, never the mechanism. Percent-encoding
still earns its place on the other grounds above — it is lossless, it avoids the
`A B.md` / `A_B.md` collision, and it keeps the common-path IRI legible.

### 3.5 Link resolution vs. IRI derivation — two separate steps

These MUST NOT be collapsed:

1. **Resolution** — `[[Einstein]]` → *which note?* This follows the **dialect's**
   rules. For the Obsidian dialect: match by name across the vault, preferring
   same-folder, then shortest path; fall back to the literal path if given.
2. **Derivation** — the resolved note → its IRI, by §3.2.

Consequence: a link's *text* never determines an IRI. `[[Einstein]]`,
`[[people/Einstein]]`, and `[[Al|Einstein]]` all yield the same IRI if they
resolve to the same note.

**Unresolved links.** A `[[wikilink]]` matching no file MUST still mint an IRI —
by §3.2 applied to the link text as a path. Obsidian treats these as valid future
notes and so MUST we; they are flagged as *dangling*, never dropped. A dangling
target that later gains a file MUST resolve to the same IRI.

The dangling IRI MUST be minted under a **fixed vault-relative prefix**
(`⟨base⟩notes/` by default, configurable per vault but **not** read from the
editor's new-note-folder setting). An earlier draft defaulted to *"the vault's
configured new-note folder"*, which put an **editor preference** inside IRI
derivation: changing that setting would silently relocate every dangling link's
IRI and churn the graph. §5.2 requires indexing to be a pure function of vault
content plus committed vocabulary, and an editor preference is neither.

**[DECIDED — v0.2] This rule MUST NOT apply to the predicate position.** A
predicate token — including the middle link of the three-link form
(`spec/01` §4.1c) — resolves **only** through §5.10, never through this section.

Without this, the authoring forms diverge exactly where they must not: an
undefined predicate written `((developed))` would mint `⟨base⟩predicate/developed`
via §5.10 rule 4, while `[[Einstein]] [[developed]] [[X]]` would mint
`⟨base⟩notes/developed` via this rule. Same authored meaning, two graph edges,
silent under-recall — the §5.1 fragmentation failure reintroduced by the mapping
layer itself. §6.2's promise that all forms lower identically depends on this.

### 3.6 Fragments

`[[Note#Heading]]` → the note IRI plus a fragment: `⟨noteIRI⟩#⟨encoded-heading⟩`.
The fragment identifies a **sub-resource** of the note. Statements about it are
distinct from statements about the note. Heading text is normalized per §3.4.

### 3.7 External IRIs

Per `spec/01` §4.1.2, a Markdown link `[label](target)` whose target is an
absolute URI is an **external IRI, used verbatim** — no normalization, no
rebasing. Vault-path targets resolve internally per §3.5.

**[DECIDED — closes `spec/01` §10 open #5]** The link **label MUST NOT** be
asserted as `rdfs:label` by default. It is display text the author chose for
this sentence, not a claim about the resource's name, and asserting it would
mint a triple the author did not write. A vault MAY enable it by config; when
enabled the label triple MUST land in the authoring note's graph, so it is
attributable and removable.

---

## 4. The prefix map

One vault note holds the prefix map — the CURIE decision (`PLAN.md` §7) doing
its three jobs: predicate/class resolution, note-IRI abbreviation, and Turtle
`@base`/`@prefix` output.

`vocabulary/prefixes.md`:

```markdown
---
rdf: prefixes
prefixes:
  schema: https://schema.org/
  dct:    http://purl.org/dc/terms/
  rdfs:   http://www.w3.org/2000/01/rdf-schema#
  owl:    http://www.w3.org/2002/07/owl#
  skos:   http://www.w3.org/2004/02/skos/core#
  cito:   http://purl.org/spar/cito/
  mldp:   https://markdown-ldp.org/ns#
  ex:     https://v.local/
---
```

Rules:

- The map MUST ship with sensible defaults (the seven above) so an author who
  never opens this file still gets working CURIEs.
- **`mldp:` is the vault's reserved namespace** (ADR-0002 §5a). It holds the few
  terms this design needs and no published vocabulary supplies — the inverted
  alignment relation (§5.3) and the constraint forms of `domain`/`range`
  (ADR-0004). It is **never an authoring surface**: no author types `mldp:`. A
  growing `mldp:` namespace is a signal we are inventing an ontology rather than
  aligning to one, and should be treated as a design smell.
- A CURIE MUST only be interpreted as such when its prefix is **in the map**.
  An unmapped `foo:bar` MUST be treated as a plain predicate name, not an IRI —
  authors write colons in ordinary words and MUST NOT be punished for it.
- `schema:` MUST default to `https://schema.org/` (https, trailing slash).

---

## 5. The vocabulary layer

The core of this spec, and — per ADR-0001 §8 — the project's highest-risk design
surface. Vocabulary, not query power, determines whether an AI can use the graph.

### 5.1 The problem being solved

Free-form predicate minting is **required** by Human-first: `((reminds me of))`
MUST work the moment it is typed. But five years of free minting yields
`developed`, `created`, `authored`, `made`, `built` as five unrelated predicates,
and "what did Einstein develop?" then returns one and misses four — *confidently,
with citations, looking complete.*

The failure is **recall through vocabulary fragmentation**, not comprehension.
An LLM reads a minted predicate's label and definition fine. It cannot know the
other four exist. The fix is therefore **alignment between predicates**, not
translation at read time.

**Why alignment rather than a better authoring UI.** The obvious cheaper fix is
to prevent fragmentation at write time: rank the author's existing predicates in
the `((` autocomplete so `created` is *offered* before `authored` is invented.
That works, and the plugin SHOULD do it anyway — but it cannot be the mechanism,
because **the primary user has no authoring UI at all.** `00-vision.md` §6 and
ADR-0001 §5a target a user working a plain folder through an AI, with no Markdown
client; imported notes and AI-written notes pass through no picker. A convergence
mechanism that only fires in one optional client is not a convergence mechanism.
This is why §5 earns its size.

### 5.2 The governing rule

> **AI belongs in the curation loop. It MUST NOT be in the query loop.**

An AI MAY *propose* an alignment. A human accepts it. The result is written into
the predicate-note as a durable fact in Markdown. From then on, resolution is
deterministic and no model is involved — ever.

This MUST be honored because the alternative destroys the product:

| Property | Alignment as durable Markdown | Alignment inferred at query time |
|---|---|---|
| Same question, same answer | yes | no |
| Golden-file testable (Phase 2) | yes | no |
| Works offline, zero per-query cost | yes | no |
| **Citations are exact** | yes | **no — you cannot cite a fuzzy match** |
| Reviewable, diffable, reversible | yes (git) | no |

The last row is decisive: citation *is* the product (`00-vision.md` §6).

It follows that **normalization MUST NOT happen at index time** either. Indexing
MUST be a pure function of vault content plus committed vocabulary. Any
network-dependent or model-dependent step in the indexer would make Phase-2's
golden-file tests unwritable and break "Markdown is the source of truth."

### 5.3 Predicate-notes — the alignment fields

Extending `spec/01` §6. `predicates/developed.md`:

```markdown
---
rdf: property
id: developed
subPropertyOf: schema:creator (inverted)
inverseOf: [[developed by]]
domain: [[Agent]]
range: [[Work]]
---
X developed Y means X was the principal creator of Y.
```

| Field | Meaning | Required |
|---|---|---|
| `rdf: property` | marks this note as a predicate-note | MUST |
| `id:` | tool-minted, rename-proof identity (§3.3) | MUST (tool-written) |
| `subPropertyOf:` | alignment to a broader predicate — §5.4 | SHOULD |
| `equivalentProperty:` | exact equivalence — use sparingly, §5.4 | MAY |
| `inverseOf:` | the inverse predicate — resolved at query time, §5.6 | MAY |
| `domain:` / `range:` | **constraints** for Phase-4 validation — *not* RDFS inference, see below | MAY |
| `functional: true` | single-valued (`spec/01` §8) | MAY |
| `datatype:` | forces literal datatype (§7.3) | MAY |
| **body prose** | the human definition | SHOULD |

### 5.3.1 How these fields lower to quads

**[DECIDED — v0.2; see ADR-0002]** These are not ordinary frontmatter. Each
declaration field lowers to a specific quad in the **predicate-note's own
graph** — or, for tool configuration, to nothing at all. An earlier draft left
this unspecified, with the result that `subPropertyOf: schema:creator (inverted)`
lowered via §5.10 rule 4 to a vault-local predicate with an **`xsd:string`
object** — a string that looks like an alignment but over which no transitive
closure is computable.

| Field | Lowers to | Notes |
|---|---|---|
| `subPropertyOf: X` | `⟨p⟩ rdfs:subPropertyOf ⟨X⟩` | standard; the entailment is sound |
| `subPropertyOf: X (inverted)` | `⟨p⟩ mldp:alignsInverted ⟨X⟩` | §5.5; RDF has no term for this |
| `equivalentProperty: X` | `⟨p⟩ owl:equivalentProperty ⟨X⟩` | + `mldp:` variant when inverted |
| `inverseOf: [[X]]` | `⟨p⟩ owl:inverseOf ⟨X⟩` | |
| `subClassOf: [[X]]` (class-notes) | `⟨c⟩ rdfs:subClassOf ⟨X⟩` | |
| `functional: true` | `⟨p⟩ rdf:type owl:FunctionalProperty` | standard |
| `domain:` / `range:` | `⟨p⟩ mldp:domain ⟨X⟩` / `mldp:range ⟨X⟩` | **ADR-0004** |
| `rdf:`, `id:`, `prefixes:`, `datatype:` | **nothing** | tool configuration — §6.1 denylist |

Two rules govern the whole table:

1. **Emit the standard term only where the standard entailment is sound.**
   `rdfs:subPropertyOf` is exported because everything `developed` *is*
   `created`. `domain`/`range` are **not** exported as `rdfs:` because in RDFS
   they are inference rules, not constraints — asserting `rdfs:domain` licenses a
   reasoner to conclude every subject *is* that type, which is the opposite of
   the validation this project wants. See ADR-0004. An external reasoner ignores
   an unknown term; it misreads a known one.
2. **The object resolves as a term, not a string.** `schema:creator` is a CURIE
   against the §4 prefix map; the ` (inverted)` marker is stripped by the
   vocabulary loader **before** resolution and recorded as the relation's
   direction. The marker is a field-level grammar, not part of the value.

**Alignment targets MAY be vault-local.** `subPropertyOf: [[made]]` is valid and
expected — a user saying "my `built` is a kind of my `made`" is the ordinary
case, not an edge case, and §5.12's claim that the starter pack *"seeds the
hierarchy"* only makes sense if vault-local predicates can attach to it. Earlier
wording ("alignment to an established vocabulary") read as forbidding this.

**The body prose is load-bearing, not decoration.** It is the input an AI uses to
propose an alignment (§5.7) and the text a human checks the proposal against.
"Developed" could mean developing a photograph or developing a disease; only the
definition disambiguates. Alignment proposals MUST cite it.

The `(inverted)` marker after an alignment target is normative and necessary —
see §5.5.

### 5.4 Prefer `subPropertyOf` over equivalence

**`subPropertyOf` MUST be the default alignment relation.** `equivalentProperty`
is available but SHOULD be reserved for genuine synonyms.

`developed` is not equivalent to `schema:creator` — it is **narrower**.
Declaring equivalence asserts something false and loses nuance. Declaring
`subPropertyOf` is honest, and it buys the desired behavior for free:

```
schema:creator
├── developed
├── authored
└── built
```

- Query `schema:creator` → transitive closure **downward** returns all three.
  **Sound, complete recall against a vocabulary the LLM already knows.**
- Query `developed` → returns only `developed`. **Precision preserved.**

Nothing is lost, nothing is overstated, and the direction of entailment is always
sound (everything `developed` *is* `created`; not conversely).

Normative:

- Query expansion over `subPropertyOf` MUST be **downward-closed** (asking for
  the broad predicate finds the narrow ones), never upward.
- The hierarchy MUST be traversed transitively.
- Expansion is a **query-layer** behavior. The store holds only asserted quads;
  it MUST NOT materialize inferred super-property quads.
- The hierarchy is read from the quads of §5.3.1 through the ordinary
  `match()` port, and MAY be cached in a derived in-memory index (ADR-0002 §5).
  At 40–200 predicates that index is kilobytes; **the quads are the truth.**

#### Direction composition (normative)

Three mechanisms flip or traverse direction independently — `subPropertyOf`
chains (§5.4), `(inverted)` alignments (§5.5), and `inverseOf` (§5.6). An
earlier draft specified each alone and never said how they compose, which is the
likeliest source of the silent wrongness §5.5 warns about.

- **Direction along a chain is XOR.** An expansion path is inverted **iff it
  crosses an odd number of inverted edges.** Two `(inverted)` hops compose to
  the same direction as none.
- **`inverseOf` applies at the query boundary, not inside the closure.** Resolve
  the requested predicate to its asserted direction *first*, then expand.
  Expanding and then inverting is **not** equivalent and MUST NOT be done.
- **Cycles** MUST be detected and reported as a validation error, then broken by
  dropping the edge whose target IRI **sorts last in Unicode codepoint order**.
  Any total order would do; the requirement is that two runs over the same vault
  produce the same graph.

### 5.5 Direction — the sentence/vocabulary mismatch

`spec/01`'s `(( ))` syntax is **subject-first and sentence-shaped**. Schema.org
is mostly **noun-shaped and points the other way**:

```markdown
[[Einstein]] ((developed)) [[Theory of Relativity]]
```
is, in schema.org terms, `Relativity schema:creator Einstein` — **inverted**.
Schema.org also defines almost no `inverseOf`, so there is no property to point
at going the other way.

Therefore an alignment MUST be able to carry a direction:

- `subPropertyOf: schema:creator` — same direction.
- `subPropertyOf: schema:creator (inverted)` — the aligned property runs
  subject↔object reversed.

When expanding a query across an inverted alignment, the query layer MUST swap
subject and object. Omitting this marker is the single most likely way to get
silently wrong results, so a proposal that cannot determine direction MUST be
surfaced for human decision rather than guessed.

### 5.6 Inverses resolved at query time

**[DECIDED]** When a predicate-note declares `inverseOf`, the indexer MUST store
**only the asserted direction**. The query layer resolves the inverse.

Rationale: half the storage, no consistency burden on drop-and-replace (R2), and
no risk of orphaned inverse quads when a predicate-note changes. Materializing
would also make an inverse quad's provenance a lie — there is no `(file, line,
span)` where the author wrote it.

The MCP traversal API MUST answer both directions transparently, and MUST label
a result reached via an inverse as such, so a citation points at the statement
actually written.

### 5.7 The alignment curation loop

A batch, human-gated pass. This is Phase 6's AI-proposes/human-curates loop
applied to **vocabulary** rather than to triples — same machinery, earlier payoff.

1. **Detect.** Find predicates with no alignment, and clusters of predicates that
   look synonymous (label similarity, shared domain/range, overlapping subject
   sets). Cheap, deterministic heuristics — no model needed to *find* candidates.
2. **Propose.** An AI reads each predicate-note's **prose definition**, label,
   and example uses, and proposes `subPropertyOf: ⟨vocab:term⟩ [(inverted)]` with
   a rationale and a confidence.
3. **Review.** The human accepts, edits, or rejects. Proposals MUST be presented
   with the definition and real example statements, never the label alone.
4. **Commit.** Acceptance **edits the predicate-note's frontmatter**. That is the
   whole persistence mechanism — a line of Markdown, in git.
5. **Reindex.** Ordinary file-change handling (R2). Nothing special.

Normative: nothing in steps 1–3 may be on the read path. An unreviewed proposal
MUST NOT affect query results. Proposals are stored outside the vault (or in a
clearly-marked staging note) until accepted.

### 5.8 The vocabulary stack

Schema.org is shaped for web publishing and commerce. It is excellent at Person,
Organization, CreativeWork, Event, Place — and **poor at what a second brain is
made of**: claims, evidence, arguments, questions, decisions. It has no
`supports` and no `contradicts`. So the vocabulary is a stack:

| Layer | Vocabulary | Covers |
|---|---|---|
| Entities & works | **schema.org** | people, orgs, works, events, places |
| Document metadata | **dct:** | created, modified, source, license |
| **Epistemic / argument** | **CiTO** | `cito:supports`, `cito:disagreesWith`, `cito:citesAsEvidence`, `cito:extends` |
| Concepts | **SKOS** (Phase 6) | broader / narrower / related |
| Structure | **rdfs:**, **owl:** | subClassOf, subPropertyOf, sameAs |
| The long tail | **vault-local** | everything else |

**[DECIDED] CiTO is adopted** for the epistemic layer. Under §5.4 this matters
more than it first appears: vault-local `supports`/`contradicts` would have
nothing to align *up to*, leaving the most reasoning-relevant predicates outside
the hierarchy exactly where recall matters most. CiTO gives that subtree a real,
published root.

### 5.9 Why schema.org, stated for the record

Beyond interop: schema.org is among the most heavily represented vocabularies in
LLM pretraining. A model already knows `schema:about`, `schema:isBasedOn`,
`schema:citation`, `schema:sameAs`. Emitting those IRIs makes the graph legible
**with zero schema-teaching in the prompt** — which attacks the vocabulary
bottleneck identified in ADR-0001 §4a(ii) head-on. That is the justification for
the alignment work, and it is why schema.org is a **mapping target and never the
authoring surface**: `((schema:creator))` as the normal way to write would
violate Human-first outright.

> **This is a dated bet, not a standing fact** (recorded 2026-08-10). It has
> never been measured, it is restated in four documents, and it is load-bearing
> for §5.4, §5.9, §5.12, and the §5.7 curation loop — the exact repetition
> pattern ADR-0001 §1 exists to catch. Unlike a real external constraint it also
> **decays**: a 2030 model's vocabulary priors are not today's.
>
> **Test:** prompt current frontier models for the schema.org term matching ~20
> starter-pack definitions; score exact-IRI recall. **Review** at Phase 5 (the
> MCP face, where it either pays off or doesn't) and annually thereafter. If
> recall is poor, the alignment machinery still stands — §5.1's fragmentation
> problem is independent — but the *choice of target vocabulary* reopens.

### 5.10 Predicate resolution order

**This is the single resolution function for the predicate position, and every
authoring form MUST use it** — frontmatter keys, inline `key::` fields, `(( ))`,
the middle link of the three-link form, `triple`-block predicates, and keys
inside `~( … )`. §3.5's link-resolution and dangling-link rules govern the
subject and object positions only; applying them to a predicate is what split the
authoring forms in v0.1 (§3.5, §6.2).

Given a predicate token from any authoring form, resolve in this order:

1. **CURIE with a mapped prefix** (`dct:creator`) → that IRI directly.
2. **Absolute URI** → itself.
3. **A predicate-note** whose `id:`, filename, or `aliases:` matches the
   normalized token (§5.11) → that note's IRI.
4. **Otherwise — mint a vault-local predicate IRI** from the normalized token,
   under `⟨base⟩predicate/`. Flag it "undefined vocabulary" (`spec/01` §6). This
   MUST NOT be an error and MUST NOT block indexing.

**[DECIDED — closes `spec/01` §10 open #4]** Predicate- and class-notes are
identified by their **frontmatter marker** (`rdf: property` / `rdf: class`)
**anywhere in the vault**, not by residing in a reserved folder. Dictating folder
layout would violate Human-first and break vaults that already have an
organization. A `predicates/` folder remains the *convention* the starter pack
uses and templates default to.

### 5.11 Predicate token normalization

For **matching only** — the note's own identity is unchanged, and the authored
form is preserved for display:

1. Trim; collapse internal whitespace runs to one space.
2. Case-fold (Unicode simple case folding).
3. Treat `-`, `_`, and space as equivalent.

So `((has part))`, `has_part::`, and `Has Part::` all resolve to the same
predicate-note. This is the mechanism behind `spec/01` §8's note that
predicate synonymy is a vocabulary-layer concern.

### 5.12 The starter pack

**[DECIDED]** The tool ships a curated set of predicate-notes, pre-aligned. Under
§5.4 this is not merely convenience — it **seeds the hierarchy**, so the first
curation pass has something to attach to instead of proposing from scratch.

- Roughly **40–60** predicates covering the common second-brain relations.
- Every one MUST carry a prose definition and a `subPropertyOf` alignment.
- Installation MUST be opt-in and the notes MUST be ordinary, editable Markdown —
  a user who edits or deletes one is exercising the design, not breaking it.
- The pack MUST NOT be special-cased anywhere in the code. It is data.

---

## 6. Mapping: Markdown → quads

Every construct in `spec/01` lowers to quads by these rules. For a note `N` with
IRI `⟨N⟩`, **every quad produced from that file MUST carry graph name `⟨N⟩`** —
including statements whose subject is some other resource.

### 6.1 Layer A — frontmatter and inline fields

Subject is `⟨N⟩`. For each key that survives the hygiene rules below, the key
resolves per §5.10 and each value maps per §7.

**[DECIDED — v0.2] The reserved-key denylist is extended with the tool's own
configuration keys.** `spec/01` §3.1's denylist (`tags`, `aliases`, `cssclasses`,
`publish`, `permalink`, `created`/`updated`, tool-owned blocks) predates every
field this spec introduced, so in v0.1 those fields all minted triples:
`rdf: property` became `⟨N⟩ ⟨predicate/rdf⟩ "property"`, `id:` minted a literal
restating the note's own identity, and the prefix-map note minted a quad from
pure YAML configuration.

Added to the denylist — **tool configuration with no RDF meaning**:

| Key | Why it mints nothing |
|---|---|
| `rdf` | the `property`/`class`/`prefixes` marker itself (§5.10) |
| `id` | identity, consumed by §3.2 |
| `prefixes` | the §4 prefix map |
| `datatype` | forces literal typing (§7.3) — a parser instruction |

The rule generalizing all four: **a key mints no quad when it is tool
configuration with no RDF expression.** Note what this deliberately does *not*
do — it does not exempt vocabulary notes as a category. Fields that *do* have RDF
meaning (`subPropertyOf`, `inverseOf`, `domain`, `range`, `subClassOf`,
`functional`) still lower, per §5.3.1; and ordinary keys on a predicate-note
(`source:`, `topic:`) map exactly as they would on any other note. A blanket
note-level exemption was considered and rejected: it would **silently drop**
authored intent, which §9, §3.5, and `spec/01` §8 all rank as the worse failure.

```markdown
---
type: [[Person]]
born: 1879-03-14
---
field:: [[Physics]]
```
→
```
⟨N⟩  rdf:type              ⟨notes/Person⟩          ⟨N⟩
⟨N⟩  ⟨predicate/born⟩      "1879-03-14"^^xsd:date  ⟨N⟩
⟨N⟩  ⟨predicate/field⟩     ⟨notes/Physics⟩         ⟨N⟩
```

`type:` and Turtle's `a` MUST map to `rdf:type`, and are multi-valued
(`spec/01` §8).

### 6.2 Layer B — statements

All three forms in `spec/01` §4.1 lower identically; the form is **not** recorded
in the graph (it is provenance, §8). "Identically" is guaranteed by §5.10's
single-resolution rule — in v0.1 it was asserted here but contradicted by §3.5,
which routed the three-link form's middle link through link resolution and gave
the same authored predicate two different IRIs whenever its predicate-note did
not yet exist.

| Form | Subject |
|---|---|
| `developed:: [[X]]` | `⟨N⟩` (implicit) |
| `[[Einstein]] ((developed)) [[X]]` | the resolved subject |
| `[[Einstein]] [[developed]] [[X]]` | the resolved subject |
| `((developed)) [[X]]` | `⟨N⟩` (implicit) |

### 6.3 Triple blocks

Each `;`-continued clause repeats the block's subject; `.` ends it. Otherwise
identical to §6.2. Parse errors inside a block MUST be reported with
`(file, line)` and MUST NOT abort indexing of the rest of the file — a partially
valid file still yields its valid quads.

### 6.4 Statement metadata → RDF-star

`~( … )` produces annotations on a **quoted triple**, which is a first-class
**term** (ADR-0001 R4, §5c).

```markdown
[[Einstein]] ((developed)) [[Relativity]] ~(source:: [[Pais 1982]], confidence:: 0.95)
```
→
```
⟨Einstein⟩ ⟨developed⟩ ⟨Relativity⟩                        ⟨N⟩
<<⟨Einstein⟩ ⟨developed⟩ ⟨Relativity⟩>> ⟨source⟩ ⟨Pais 1982⟩ ⟨N⟩
<<⟨Einstein⟩ ⟨developed⟩ ⟨Relativity⟩>> ⟨confidence⟩ 0.95    ⟨N⟩
```

Normative:

- The base statement MUST also be asserted. `~( … )` annotates; it does not
  replace.
- Keys inside `~( … )` are predicates and resolve per §5.10.
- Nesting (`~( … )` on an annotation) is **not** supported. `spec/01` cannot
  produce it, and excluding it keeps the quoted-triple term simple.
- The quoted triple's identity is `(s, p, o)` — **graph-independent**. Two notes
  annotating the same statement annotate the *same* quoted triple, though their
  annotation quads land in different graphs. This is what makes "who disagrees
  about this claim?" answerable.

### 6.5 What produces no quads

MUST NOT mint quads: `#tags` (`spec/01` §7, absent §7.2 opt-in); reserved
frontmatter keys (`spec/01` §3.1 as extended by §6.1 above); naked/autolinked
URLs; **plain `[[wikilinks]]` in prose.**

That last one is the design's central restraint and MUST be honored: an untyped
link is not a statement. It is why the graph stays a graph of *meaning* rather
than a link dump, and it is what makes the quad-count estimates in ADR-0001 §3
hold.

---

## 7. Terms

Four kinds: **IRI**, **literal**, **blank node**, **quoted triple** (§6.4).

### 7.1 Blank nodes

The authoring surface cannot produce one. The mapping MUST NOT mint them. They
exist in the term model only because imported RDF may contain them.

**Documented limit: a quad containing a blank node has no stable identity.**
Blank node labels are scoped to a parse, not to a vault, so reindexing the same
source may legitimately produce a different label and therefore a different quad
identity (ADR-0003 §4c). Dedupe (§9) and provenance lookup are consequently
unreliable for such quads. This is a concrete prerequisite for §13 #5: any
import path MUST **skolemize** — replace each blank node with a deterministic
vault-local IRI derived from the source file and position — before indexing.

### 7.2 Literals

A literal is `(lexical form, datatype)` with an optional language tag.
Language-tagged literals have no authoring syntax yet; the term model MUST
support them for import.

### 7.3 Datatype inference — deliberately conservative

**[DECIDED — closes `spec/01` §10 open #1]** Surprising coercion is worse for a
layman than an over-broad string. Inference runs on the value's **string form**
by one shared rule, so `born: 1879` and `born:: 1879` MUST yield an identical
literal.

Infer **only** these, on a full-string match:

| Pattern | Datatype |
|---|---|
| `YYYY-MM-DD` | `xsd:date` |
| ISO 8601 date-time | `xsd:dateTime` |
| `-?[0-9]+` | `xsd:integer` |
| `-?[0-9]+\.[0-9]+` | `xsd:decimal` |
| exactly `true` / `false` | `xsd:boolean` |

Everything else is `xsd:string`. Notably **not** inferred: partial dates
(`2024-01`), locale dates (`3/14/1879`), exponent notation, currency, `yes`/`no`.

A predicate-note MAY declare `datatype:` to force a datatype; that MUST override
inference. This is the escape hatch that lets inference stay conservative.

### 7.4 Multi-valued inline fields

**[DECIDED — closes `spec/01` §10 open #1, second part]** Split an inline `::`
value on commas **only when every comma-separated part is a link or a quoted
literal.** Otherwise the whole value is one literal.

| Written | Result |
|---|---|
| `field:: [[A]], [[B]]` | two quads |
| `born in:: Ulm, Germany` | **one** literal `"Ulm, Germany"` |
| `alias:: "Al", "Bert"` | two literals |
| `note:: [[A]], and also B` | **one** literal (mixed → no split) |

Rationale: a bare scalar containing a comma is ordinary prose and MUST survive
intact. YAML lists in frontmatter always split — that is YAML's own semantics.

---

## 8. Provenance

Every **occurrence** of an authored quad MUST record:

```
(quad, file, line, colStart, colEnd, form)
```

where `form` ∈ {`frontmatter`, `inline-field`, `statement`, `three-link`,
`triple-block`, `annotation`}.

Normative:

- Provenance is **out-of-band metadata about the index**, NOT quads. It MUST NOT
  appear in the graph, in Turtle output, or in query results as triples. It
  exists to answer "where was this written?" — and per ADR-0001 §5b it is a
  plain, indexable side structure, which is a principal reason the store is what
  it is.
- Identical quads dedupe (§9) but MUST retain **every** occurrence, so the UI can
  say "asserted in 3 places."
- **`line` is 1-indexed** (the first line of a file is line 1), matching what
  every editor and `file:line` convention displays. **`colStart`/`colEnd` are
  0-indexed character offsets into the line**, not byte offsets; `colEnd` is
  exclusive. The two bases differ deliberately and MUST be stated wherever
  provenance is rendered, because `file:line:col` output is read by humans.
- Provenance MUST be dropped and rebuilt with its graph on reindex (R2).
- Every quad returned by the MCP face MUST be citable to at least one occurrence.
  A quad with no provenance is a bug.

---

## 9. Canonicalization & dedupe

Per `spec/01` §8, resolved into ordering:

1. Parse → raw statements with spans.
2. Resolve subjects/objects to terms (§3), predicates to IRIs (§5.10).
3. Normalize literals (§7.3).
4. **Then** dedupe: identical `(s, p, o, g)` collapse to one quad; all
   occurrences are retained (§8).

"Identical" means **equal canonical form** — a canonical N-Quads-flavored
serialization defined in **ADR-0003 §4**, which recurses into quoted triples
(§6.4) and is stable across processes so golden files can compare it. v0.1 left
equality undefined, which left both this section and §10's provenance keying
unimplementable.

Dedupe MUST happen **after** resolution, never on surface syntax — that is what
makes `author::` and `((author))` collapse when they resolve to the same IRI.

Multi-valued by default; `rdf:type` is multi-valued. Only predicates declared
`functional:` can conflict, and a conflict is a **warning listing all sources**,
never a silent drop.

Cross-graph: the same `(s, p, o)` asserted in two notes yields **two distinct
quads** — different `g`. They MUST NOT dedupe. Two notes independently asserting
a fact is meaningful, and collapsing it would destroy authorship provenance.

---

## 10. The `QuadStore` port

The mapping engine and query layer MUST talk to this interface and MUST NOT
reference SQL, files, or any engine type. Per ADR-0001 §7 the port is mandatory
and is what keeps the backend a one-module swap.

```ts
type TermKind = 'iri' | 'literal' | 'blank' | 'triple'

interface Term {
  kind: TermKind
  value: string           // IRI, lexical form, or blank label
  datatype?: string       // literals
  language?: string       // literals
  triple?: Quad           // kind === 'triple' (§6.4)
}

interface Quad { s: Term; p: Term; o: Term; g: Term }

interface Occurrence {
  file: string; line: number; colStart: number; colEnd: number
  form: 'frontmatter' | 'inline-field' | 'statement'
      | 'three-link' | 'triple-block' | 'annotation'
}

interface Pattern {                     // undefined = wildcard
  s?: Term; p?: Term; o?: Term; g?: Term
}

interface QuadWithProvenance {
  quad: Quad
  occurrences: Occurrence[]   // ≥ 1 — a quad with none is a bug (§8)
}

interface QuadStore {
  // Write — graph-atomic (R2). The ONLY mutation.
  replaceGraph(g: Term, entries: QuadWithProvenance[]): Promise<void>
  dropGraph(g: Term): Promise<void>

  // Read
  match(p: Pattern, limit?: number): AsyncIterable<Quad>
  count(p: Pattern): Promise<number>
  provenance(q: Quad): Promise<Occurrence[]>   // matches by canonical form (ADR-0003)

  // Full-text (R8) — hybrid retrieval; see ADR-0001 §5b
  searchText(q: string, limit?: number): AsyncIterable<{ graph: Term; snippet: string }>

  // Lifecycle
  clear(): Promise<void>
  close(): Promise<void>
}
```

Notes:

- **`replaceGraph` is the only write.** There is no `addQuad`. Making
  drop-and-replace the sole mutation makes R2 unavoidable by construction and
  removes any path to stale quads.
- Provenance is passed **with** the quads, so a backend cannot store one without
  the other. **v0.2:** this was previously a side `Map<Quad, Occurrence[]>`,
  which could not work — a JavaScript `Map` keys on *reference* identity, so it
  silently required the caller to pass the same object references appearing in
  `quads`, and `provenance(q)` on the read path could never match a
  freshly-built `Quad`. Pairing each quad with its occurrences makes the stated
  invariant structural instead of a note asking implementers to be careful
  (ADR-0003 §4d).
- `match` returns an async iterable so a backend can stream; callers MUST NOT
  assume the whole result fits in memory. Result **order is unspecified** and
  there is no cursor: `limit` truncates, it does not paginate. Ordered or paged
  access, if needed, is an R5a query-layer concern above this port — adding it
  here approaches the ADR-0001 §7a tripwire.
- **`subPropertyOf` expansion and inverse resolution live ABOVE this port** — in
  the query layer, not the store. The store returns asserted quads only. The
  hierarchy itself *is* stored as ordinary quads (§5.3.1), so the query layer
  reads it through `match()` and needs no vocabulary API on this port — which is
  the main reason ADR-0002 lands where it does.
- The port deliberately exposes no query *language*. Growing it toward one is the
  ADR-0001 §7a tripwire.

---

## 11. Worked example, end to end

`notes/Relativity.md`, base `https://v.local/`:

````markdown
---
type: [[Work]]
year: 1915
tags: [physics]
---
The theory of relativity.

author:: [[Einstein]]

((influenced)) [[GPS]] ~(confidence:: 0.8)
````

With `predicates/author.md` declaring `subPropertyOf: schema:creator`.

Graph name for every quad: `https://v.local/notes/Relativity`.

```turtle
@base <https://v.local/> .

<notes/Relativity>
    a                      <notes/Work> ;
    <predicate/year>       1915 ;                    # xsd:integer (§7.3)
    <predicate/author>     <notes/Einstein> ;
    <predicate/influenced> <notes/GPS> .

<< <notes/Relativity> <predicate/influenced> <notes/GPS> >>
    <predicate/confidence> 0.8 .                     # xsd:decimal
```

- `tags: [physics]` → **no quad** (§6.5).
- `year: 1915` → `xsd:integer`; a bare 4-digit number is an integer, not a date
  (§7.3).
- `author::` and `((influenced))` both took the implicit subject `⟨N⟩`.
- **No `schema:creator` quad is stored.** The alignment lives in
  `predicates/author.md`; a query for `schema:creator` finds this quad by
  downward closure at query time (§5.4). What *is* stored, in
  `⟨predicates/author⟩`'s own graph, is `⟨predicate/author⟩ rdfs:subPropertyOf
  ⟨https://schema.org/creator⟩` (§5.3.1).
- Provenance (not in the graph): the `author` quad at **line 8, cols 0–21**,
  form `inline-field` — line 1-indexed, columns 0-indexed and `colEnd`
  exclusive, per §8. (`author:: [[Einstein]]` is 21 characters, and counting the
  frontmatter fence at line 1 puts it on line 8. v0.1 said "line 9, cols 0–24".)

---

## 12. Decisions closed here

- **Percent-encode, never substitute**, in IRI derivation; `spec/01`'s
  `Theory_of_Relativity` renderings are illustrative only. (§3.4)
- **Link resolution and IRI derivation are separate steps.** (§3.5)
- **Dangling wikilinks mint IRIs** and are flagged, never dropped. (§3.5)
- **External link labels are not `rdfs:label`** by default. *(closes `spec/01`
  §10 #5)* (§3.7)
- **AI in the curation loop, never the query loop**; alignment is a durable
  Markdown fact. (§5.2)
- **`subPropertyOf` is the default alignment**, with downward-closed query
  expansion. (§5.4)
- **Alignments carry direction** — `(inverted)`. (§5.5)
- **Inverses resolved at query time**, never materialized. (§5.6)
- **CiTO adopted** for the epistemic layer. (§5.8)
- **Predicate/class notes found by frontmatter marker, anywhere.** *(closes
  `spec/01` §10 #4)* (§5.10)
- **Starter pack ships**, ~40–60 aligned predicates, opt-in, ordinary Markdown.
  (§5.12)
- **Conservative datatype inference** + `datatype:` override. *(closes `spec/01`
  §10 #1)* (§7.3)
- **Comma-splitting only for all-link/all-quoted values.** *(closes `spec/01`
  §10 #1)* (§7.4)
- **Provenance is out-of-band, never quads.** (§8)
- **`replaceGraph` is the only write on the port.** (§10)

Added in v0.2:

- **Identity is always vault-local.** `id:` MUST be a bare token; external
  identity is a `sameAs:` assertion lowering to `owl:sameAs`. (§3.2)
- **Reversibility is scoped to path-derived IRIs**; the LDP face resolves through
  an IRI ⇄ path map, never by decoding. (§3.4)
- **Dangling links mint under a fixed prefix**, not an editor preference. (§3.5)
- **Predicate resolution is one function for all authoring forms**; §3.5 governs
  subject/object positions only. (§3.5, §5.10, §6.2)
- **Alignment fields have a lowering table** — standard terms where the
  entailment is sound, `mldp:` where RDF has no word. (§5.3.1, ADR-0002)
- **Direction composes by XOR; `inverseOf` applies at the query boundary; cycles
  break by codepoint order.** (§5.4)
- **Alignment targets MAY be vault-local.** (§5.3.1)
- **Tool-configuration keys mint nothing** — `rdf`, `id`, `prefixes`, `datatype`
  join the denylist; vocabulary notes are *not* exempt as a category. (§6.1)
- **Quad identity is a canonical serialization.** (§9, ADR-0003)
- **`replaceGraph` pairs each quad with its occurrences.** (§10, ADR-0003 §4d)
- **`mldp:` reserved namespace** added to the default prefix map. (§4)
- **schema.org's pretraining prevalence is a dated bet** with a stated test and
  review point. (§5.9)

## 13. Still open

1. **Class-note shape → SHACL?** Deferred to Phase 4 (`spec/01` §10 #3), now
   coupled to **ADR-0004** — whether `mldp:domain`/`mldp:range` compile to SHACL
   is the same question and should be answered once.
2. **Raw ` ```turtle ` blocks** alongside ` ```triple `. Deferred; nothing here
   depends on it (`spec/01` §10 #2).
3. **Language-tagged literals** have a term-model slot but no authoring syntax.
   Needed only for import. Canonical form is specified regardless (ADR-0003 §4a).
4. **The exact starter-pack contents.** §5.12 fixes the policy, not the list.
   Drafting it is its own task and SHOULD happen with a real vault in hand. Its
   alignments are also the corpus for the §5.9 measurement.
5. **Imported RDF** (Turtle files dropped in a vault) — identity and graph-naming
   rules undefined. Out of scope for the core; will need its own section.
   **Skolemization is now a named prerequisite** (§7.1, ADR-0003 §4c).
6. **Three-link shorthand confirmation** remains open in `spec/01` §10 #6; this
   spec maps it either way.
7. **Is the §5.7 curation loop needed before Phase 6?** A 500-note vault has
   perhaps 20 predicates; fragmentation is a five-year problem. The loop is
   specified here because §5.3.1 needs the fields to exist, but *building* it
   early may be premature — a frequency-ranked predicate list may carry the first
   two years. Phasing question, not a design question.
8. **`equivalentProperty` inverted variant** — §5.3.1 notes it exists; the
   `mldp:` term is unnamed because no use case has appeared yet.
