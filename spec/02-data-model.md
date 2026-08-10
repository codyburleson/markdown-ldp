# Data Model — Identity, Vocabulary, Mapping & the Store Port (DRAFT v0.1)

Status: **Draft / for review.** This is the last Phase-1 spec and the one every
line of Phase-2 code is written against. It is **storage-agnostic**: no physical
schema, no SQL. The physical schema lives in `spec/04-index-store.md` (see
`spec/adr/0001-quad-store-backend.md` §5d).

Governing constraint throughout: **Human-first, RDF-hidden**
(`00-vision.md` §3, `PLAN.md` §2). Where two mappings are defensible, the one a
layman would predict wins.

Related: `01-triple-authoring-syntax.md` (the authoring surface this maps *from*),
`03-ldp-http.md` (the HTTP face this maps *to*), ADR-0001 (the store).

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
return exactly that note's graph, and it is the same conflation LDP itself makes
between a resource and its representation. Consequences that implementers MUST
respect:

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

1. **If frontmatter carries `id:`**, that value is the note's identity.
   - A bare token (no scheme, no `/`) is a **stable local id** →
     IRI = `⟨base⟩id/⟨token⟩`.
   - An absolute URI is used **verbatim** as the note's IRI.
   - `id:` makes identity **rename-proof** and MUST win over the path.
2. **Otherwise**, IRI = `⟨base⟩` + `P` with the `.md` extension removed and each
   path segment percent-encoded per §3.4.

Worked:

| Path / frontmatter | IRI (base `https://v.local/`) |
|---|---|
| `notes/Einstein.md` | `https://v.local/notes/Einstein` |
| `notes/Theory of Relativity.md` | `https://v.local/notes/Theory%20of%20Relativity` |
| `notes/E.md` with `id: einstein` | `https://v.local/id/einstein` |
| `notes/E.md` with `id: https://www.wikidata.org/entity/Q937` | `https://www.wikidata.org/entity/Q937` |

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

This is lossless and reversible, which the LDP face requires: `GET` on an IRI
MUST be able to recover the file path by decoding alone.

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
by §3.2 applied to the link text as a path, defaulting to the vault's configured
new-note folder. Obsidian treats these as valid future notes and so MUST we;
they are flagged as *dangling*, never dropped. A dangling target that later gains
a file MUST resolve to the same IRI.

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
  ex:     https://v.local/
---
```

Rules:

- The map MUST ship with sensible defaults (the six above) so an author who
  never opens this file still gets working CURIEs.
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
| `subPropertyOf:` | alignment to an established vocabulary — §5.4 | SHOULD |
| `equivalentProperty:` | exact equivalence — use sparingly, §5.4 | MAY |
| `inverseOf:` | the inverse predicate — resolved at query time, §5.6 | MAY |
| `domain:` / `range:` | advisory typing for Phase-4 validation | MAY |
| `functional: true` | single-valued (`spec/01` §8) | MAY |
| `datatype:` | forces literal datatype (§7.3) | MAY |
| **body prose** | the human definition | SHOULD |

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
- A cycle in the hierarchy MUST be detected, reported as a validation error, and
  the cycle broken deterministically rather than hanging the query.
- Expansion is a **query-layer** behavior. The store holds only asserted quads;
  it MUST NOT materialize inferred super-property quads.

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

### 5.10 Predicate resolution order

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

Subject is `⟨N⟩`. For each key that survives the `spec/01` §3.1 hygiene rules,
the key resolves per §5.10 and each value maps per §7.

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
in the graph (it is provenance, §8).

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
frontmatter keys (§3.1 denylist); naked/autolinked URLs; **plain `[[wikilinks]]`
in prose.**

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
- Offsets are **character offsets into the line**, not byte offsets.
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

interface QuadStore {
  // Write — graph-atomic (R2). The ONLY mutation.
  replaceGraph(g: Term, quads: Quad[], prov: Map<Quad, Occurrence[]>): Promise<void>
  dropGraph(g: Term): Promise<void>

  // Read
  match(p: Pattern, limit?: number): AsyncIterable<Quad>
  count(p: Pattern): Promise<number>
  provenance(q: Quad): Promise<Occurrence[]>

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
  the other.
- `match` returns an async iterable so a backend can stream; callers MUST NOT
  assume the whole result fits in memory.
- **`subPropertyOf` expansion and inverse resolution live ABOVE this port** — in
  the query layer, not the store. The store returns asserted quads only.
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
  downward closure at query time (§5.4).
- Provenance (not in the graph): the `author` quad at line 9, cols 0–24, form
  `inline-field`.

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

## 13. Still open

1. **Class-note shape → SHACL?** Deferred to Phase 4 (`spec/01` §10 #3).
2. **Raw ` ```turtle ` blocks** alongside ` ```triple `. Deferred; nothing here
   depends on it (`spec/01` §10 #2).
3. **Language-tagged literals** have a term-model slot but no authoring syntax.
   Needed only for import.
4. **The exact starter-pack contents.** §5.12 fixes the policy, not the list.
   Drafting it is its own task and SHOULD happen with a real vault in hand.
5. **Imported RDF** (Turtle files dropped in a vault) — identity and graph-naming
   rules undefined. Out of scope for the core; will need its own section.
6. **Three-link shorthand confirmation** remains open in `spec/01` §10 #6; this
   spec maps it either way.
