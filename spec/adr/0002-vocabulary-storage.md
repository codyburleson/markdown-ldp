# ADR-0002 — Where the vocabulary lives, and how the query layer reads it

Status: **LEANING — alignments lower to real quads in the predicate-note's own
graph, with a derived in-memory vocabulary index above the `QuadStore` port.**
Specs MAY be written against this. Closure is gated on the §6 prototype, run at
Phase 3 entry alongside `spec/04`.

Context date: 2026-08-10

---

## 1. Why this ADR exists

`spec/02` §5.4 makes a normative promise: querying a broad predicate MUST return
its narrow ones by **downward-closed transitive expansion** over `subPropertyOf`.
`spec/02` §5.3 says the alignment is authored as predicate-note frontmatter.

Between those two sections there is nothing. **The spec never says where the
hierarchy is stored or what reads it.** Under the mapping rules as written
(`spec/02` §6.1), `subPropertyOf: schema:creator (inverted)` is an ordinary
frontmatter key whose value is not a CURIE — the trailing ` (inverted)` breaks
the prefix match — so §5.10 rule 4 mints a **vault-local predicate** with an
**`xsd:string` object**:

```
⟨predicate/developed⟩ ⟨base⟩predicate/subPropertyOf "schema:creator (inverted)" ⟨…⟩
```

That is not an alignment. It is a string that happens to look like one. The
query layer cannot compute a transitive closure over it, `spec/02` §10's port
exposes no vocabulary API, and an external SPARQL engine handed the subgraph
(R5b) sees no hierarchy at all.

This is load-bearing in the ADR-0001 §1 sense: it is the mechanism the entire
§5 vocabulary layer rests on, it appears settled because §5.4 speaks in MUSTs,
and it blocks both Phase 2 (golden files would encode the wrong thing) and
Phase 3 (the traversal API cannot be built).

Per ADR-0001 §8, vocabulary design — not the backend — is now this project's
riskiest surface. This is that risk, made concrete.

## 2. What the vocabulary layer must actually do

| # | Requirement | Source |
|---|---|---|
| V1 | Resolution is **deterministic, offline, model-free** | `spec/02` §5.2 |
| V2 | Alignments are **durable Markdown** — git-diffable, reviewable, reversible | `spec/02` §5.2, §5.12 |
| V3 | Support **downward-closed transitive closure** on every query, cheaply | `spec/02` §5.4 |
| V4 | Carry **direction** (`(inverted)`) through storage into query | `spec/02` §5.5 |
| V5 | Survive **R5b materialization** — an external SPARQL engine sees the hierarchy, or we state plainly that it does not | ADR-0001 R5b |
| V6 | Appear correctly in **Turtle / LDP export** of a predicate-note | `spec/02` §3.4, `spec/03` |
| V7 | Be **rebuildable from the vault** with no separate persistence | R6 |
| V8 | Predicate-notes stay **ordinary notes** — no reserved folder, no special-casing | `spec/02` §5.10, §5.12 |
| V9 | Compose with **`inverseOf`** (`spec/02` §5.6) without ambiguity | `spec/02` §5.6 |

Scale, which decides more here than it first appears: a vault holds roughly
**40–200 predicates** (the starter pack is 40–60, per `spec/02` §5.12). The
entire hierarchy is **kilobytes**. Any approach is fast enough; this is not a
performance decision, and — as in ADR-0001 §3 — speed should not be allowed to
become the deciding axis.

## 3. Candidates

| | Approach | V3 closure | V4 direction | V5 R5b | V6 export | V7 rebuild | Port change |
|---|---|---|---|---|---|---|---|
| **A** | **Alignments lower to real quads**; closure reads them back through `match()` | recursive `match()` | needs an encoding — §4 | **free** | **free** | free (R2) | none |
| **B** | **Loader state** — a `Vocabulary` object built by scanning `rdf:`-marked notes, held above the port | in-memory walk | native (a field) | must be re-emitted | **absent** | free | sibling port |
| **C** | **One vocabulary file** (not notes) | in-memory walk | native | must be re-emitted | absent | free | sibling port |

**C is rejected on V8.** It abandons "the ontology lives in the vault as notes"
(`spec/00` §3, `PLAN` §2, `spec/01` §6) — a stated project goal. It was worth
generating, because it dissolves the whole problem class by construction, and it
remains the fallback if A and B both prove unworkable. But a review pass does
not get to delete a goal.

**B is coherent and nearly won.** Direction is native — `inverted` is a boolean
field on an object, not an RDF term that has to be expressible. Nothing is
special-cased in the store. The vocabulary is plainly *configuration*, and
keeping configuration out of the knowledge graph is defensible on its own terms.

**B loses on V5 and V6, and they are the same loss twice.** An alignment that
exists only in loader memory is invisible to anything outside this tool. `GET`
on a predicate-note returns Turtle that omits the one fact that makes the
predicate meaningful to an external consumer. The R5b hatch — the reason we can
claim to keep RDF without building SPARQL — materializes a subgraph with no
`rdfs:subPropertyOf` in it, so a real SPARQL engine cannot reproduce the
expansion our own query layer performs. That is a graph that means one thing
inside this tool and something weaker everywhere else, which is precisely the
interop credibility `spec/00` §2 says LDP conformance is *for*.

There is also a smaller cost: B reintroduces a mild form of ADR-0001's RR4 —
two things derived from one parse pass that must not drift. It is much milder
than the FTS case that killed candidate F there (same pass, same transaction
boundary, kilobytes), but it is not nothing.

## 4. The direction problem, which is A's real cost

A's difficulty is V4. `subPropertyOf: schema:creator (inverted)` does **not**
mean `⟨developed⟩ rdfs:subPropertyOf ⟨schema:creator⟩`. It means: *the inverse
of `developed` is a sub-property of `schema:creator`.* RDF has no way to name
"the inverse of `developed`" without a node to hang `owl:inverseOf` on — and
`spec/02` §7.1 forbids minting blank nodes.

Three encodings were considered:

1. **Blank node** — `⟨developed⟩ owl:inverseOf _:x . _:x rdfs:subPropertyOf
   schema:creator`. Correct OWL. Violates §7.1, and blank nodes are exactly the
   term kind that makes drop-and-replace and dedupe hard. **Rejected.**
2. **Reuse the declared inverse** — if the note declares
   `inverseOf: [[developed by]]`, emit `⟨developed by⟩ rdfs:subPropertyOf
   schema:creator`. Elegant when an inverse exists, but `inverseOf` is MAY
   (`spec/02` §5.3), so it is undefined for most predicates. **Insufficient
   alone.**
3. **A vault-local term for the case RDF has no word for.** Same-direction
   alignments emit standard `rdfs:subPropertyOf`. Inverted alignments emit a
   vault-local `mldp:alignsInverted`. **Adopted — see §5.**

## 5. Position

**Lean: candidate A, with a split encoding — standard where the standard is
correct, explicit vault-local where RDF has no word.**

```markdown
---
rdf: property
id: developed
subPropertyOf: schema:creator (inverted)
inverseOf: [[developed by]]
---
```

lowers, in graph `⟨predicates/developed⟩`, to:

```turtle
<predicate/developed> <mldp:alignsInverted> schema:creator .
<predicate/developed> owl:inverseOf        <predicate/developed-by> .
```

and the same note without `(inverted)` would instead emit the standard term:

```turtle
<predicate/developed> rdfs:subPropertyOf schema:creator .
```

Grounds, in order:

1. **V5 and V6 come free**, and they are the requirements B cannot buy at any
   price. The alignment is a real quad in the predicate-note's own graph, so it
   exports, it materializes, and `GET /predicates/developed` says what the
   predicate means.
2. **Honesty at the boundary.** `rdfs:subPropertyOf` is emitted only where the
   RDFS entailment is actually sound. The inverted case gets a term an external
   reasoner will **ignore** rather than **misread** — the same discipline
   ADR-0004 applies to `domain`/`range`. A vocabulary that quietly overstates
   itself on export is worse than one that under-claims.
3. **V7 and V8 come free.** Alignments are quads in a note's graph, so R2
   drop-and-replace already maintains them, and predicate-notes need no special
   handling in the indexer.
4. **No port change.** `spec/02` §10 stays as it is. The hierarchy is read with
   the `match()` the port already has.

**The derived index.** Closure is computed against an **in-memory vocabulary
index built once at load** by reading these quads back through `match()`, and
invalidated when any `rdf:`-marked note's graph is replaced. This is a cache of
a cache — legitimate under `PLAN` §2's "Markdown is the source of truth", and at
40–200 predicates it is kilobytes and microseconds. **The quads are the truth;
the index is an optimization** and MUST be rebuildable from them alone.

Consequences for the fields:

- `subPropertyOf` → `rdfs:subPropertyOf`, or `mldp:alignsInverted` when marked.
- `equivalentProperty` → `owl:equivalentProperty` (+ an inverted variant).
- `inverseOf` → `owl:inverseOf`.
- `subClassOf` → `rdfs:subClassOf`.
- `functional: true` → `⟨p⟩ rdf:type owl:FunctionalProperty`.
- `domain` / `range` → **held, pending ADR-0004.** They are constraint semantics
  wearing RDFS inference names; emitting them as `rdfs:` would license type
  inference the vault never asserted.
- `rdf`, `id`, `prefixes`, `datatype` → **no quads.** Tool configuration with no
  RDF meaning; added to the `spec/01` §3.1 reserved-key denylist.

### 5a. The `mldp:` prefix

The vault's own reserved namespace, added to the `spec/02` §4 default prefix map
alongside the existing six. It holds terms this design needs and no published
vocabulary supplies. It is not an authoring surface — no author ever types
`mldp:` — and it stays deliberately small. **A growing `mldp:` namespace is a
signal that we are inventing an ontology rather than aligning to one.**

### 5b. Tripwire — the condition that reverses this

> **If the vocabulary index starts needing joins, cost decisions, or its own
> persistence, stop.** That means it has become a store, and it belongs behind
> the `QuadStore` port (or a sibling port) rather than living as a loose
> in-memory structure above it.

In the same spirit as ADR-0001 §7a: growth in the *number* of alignment
relations is fine. Growth into a second query engine is the tripwire.

## 6. Decision gate — what closes this ADR

At **Phase 3 entry**, alongside `spec/04`:

1. **Prototype the closure** over a realistic hierarchy (the starter pack, ~50
   predicates, depth 3–4) and confirm the recursive `match()` walk is correct
   and sub-millisecond from the in-memory index.
2. **Prototype direction composition** — the §7 rule below — against a
   hand-built adversarial hierarchy containing a double inversion, a chain
   through `inverseOf`, and a cycle.
3. **Exercise V5 once.** Materialize a vault containing aligned predicates into
   an in-memory RDF engine and confirm a real SPARQL 1.1 query over
   `rdfs:subPropertyOf*` reproduces our own expansion for the same-direction
   case. Record explicitly what it does *not* reproduce (the inverted case) —
   documented limits are a deliverable, per ADR-0001 §1.

## 7. Direction composition (normative, and currently missing from `spec/02`)

Three mechanisms flip or traverse direction independently, and `spec/02` never
says how they compose. Stated here so the prototype has something to verify:

- **Direction along an alignment chain is XOR.** Two `(inverted)` hops compose
  to the same direction as none. An expansion path's net direction is inverted
  iff it crosses an odd number of inverted edges.
- **`inverseOf` is applied at the query boundary, not inside the closure.**
  Resolve the requested predicate to its asserted direction first, then expand.
  Expanding and then inverting is not equivalent, and mixing the two is the
  likely source of the silent wrongness `spec/02` §5.5 warns about.
- **Cycles break deterministically by dropping the edge whose target IRI sorts
  last** in codepoint order, and MUST be reported as a validation error. Any
  total order works; the requirement is that two runs on the same vault produce
  the same graph.

## 8. Consequences

- `spec/02` §5.3 gains a **lowering table** — every alignment field, and the
  quad it produces.
- `spec/02` §5.4 gains the **direction-composition rules** above.
- `spec/02` §4 gains `mldp:` in the default prefix map.
- `spec/02` §6.1 gains the **extended reserved-key denylist** (`rdf`, `id`,
  `prefixes`, `datatype`).
- `spec/02` §10 is **unchanged** — this was the outcome worth having.
- `spec/04` must note that the vocabulary index is derived and rebuilt on any
  `rdf:`-marked graph replacement.
- **ADR-0004 is now blocking this ADR's field table** for `domain`/`range`.
