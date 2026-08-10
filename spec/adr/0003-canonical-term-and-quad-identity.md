# ADR-0003 — Canonical form for terms and quads

Status: **LEANING — a canonical N-Quads-flavored serialization is the normative
identity; the write path is restructured so it needs no keying at all.**
Specs and Phase-2 code MAY be written against this. Closure at Phase 2 exit,
when golden-file tests have exercised it.

Context date: 2026-08-10

---

## 1. Why this ADR exists

`spec/02` §10 defines the `QuadStore` port — the single interface every line of
Phase-2 code is written against. As drafted it is **not implementable**:

```ts
replaceGraph(g: Term, quads: Quad[], prov: Map<Quad, Occurrence[]>): Promise<void>
provenance(q: Quad): Promise<Occurrence[]>
```

`Quad` is a structural object literal. A JavaScript `Map` keys on **reference
identity**, not value. So `prov` silently requires that the caller pass the
identical object references that appear in `quads` — an unstated contract that
any refactor breaks without a type error — and `provenance(q)` on the read path
receives a freshly-constructed `Quad` that can never match a stored key.

The same gap appears twice more:

- **`spec/02` §9** requires that *"identical `(s, p, o, g)` collapse to one
  quad."* Identity is undefined, so "identical" is undefined.
- **`spec/02` §6.4** states the quoted triple's identity is `(s, p, o)` and is
  **graph-independent** — so equality must recurse into `Term.triple`, and the
  recursion must deliberately *not* consider the graph. Nothing says so.

This blocks the first commit of Phase 2, and it silently shapes the golden-file
tests (`PLAN` Phase 2) that everything afterward is checked against. Cheap now;
expensive once fixtures encode a guess.

## 2. Requirements

| # | Requirement | Source |
|---|---|---|
| C1 | Decide **equality** for dedupe | `spec/02` §9 |
| C2 | Key **provenance** by quad on the read path | `spec/02` §10 |
| C3 | Recurse into **quoted triples**, graph-independently | `spec/02` §6.4 |
| C4 | Be **stable across processes and machines** — golden files compare it | Phase 2 tests |
| C5 | Be **stable across a rebase** of the vault's base IRI | `spec/02` §3.1 |
| C6 | Stay **storage-agnostic** — no dependency on the SQLite schema | ADR-0001 §8 |
| C7 | Be **inspectable** — a human debugging a mapping bug can read it | ADR-0001 §5b |

## 3. Candidates

| | Approach | C4 stable | C5 rebase-safe | C7 readable | Cost |
|---|---|---|---|---|---|
| **A** | **Canonical string** — N-Quads-flavored serialization | yes | yes (§4) | **yes** | one string per quad |
| **B** | **Structural hash** — digest over A's bytes | yes | yes | no | collision handling |
| **C** | **Interning** — dictionary-encode terms to integers; a quad is 4 ints | process-local only | yes | no | leaks ADR-0001 §5d upward |

**C is rejected on C4 and C6.** Integer ids are assigned in encounter order, so
they are not stable across runs and cannot appear in a golden file. It also
pulls the physical schema's dictionary encoding (ADR-0001 §5d) up into the
storage-agnostic layer, which is exactly the coupling the port exists to
prevent. Interning remains the right thing *inside* a backend — it is simply not
the spec's identity.

**B is A plus a digest.** It is strictly downstream of A: you cannot hash
without first canonicalizing. So B is not a competing choice, it is an
optimization a backend MAY apply.

## 4. Position

**Lean: candidate A — a canonical serialization is the normative identity.
Backends MAY hash or intern for performance, provided they agree with A.**

### 4a. Term canonical form

- **IRIs** — serialized in the form the index **stores**, i.e. **vault-relative**
  (`spec/02` §3.1), never resolved against the base. This satisfies **C5
  directly**: `spec/02` §3.1 promises *"rebasing a vault MUST require no
  reindex"*, and a canonical form containing the base would change every quad's
  identity the moment the base changed, forcing precisely the reindex the spec
  forbids. External IRIs (`spec/02` §3.7) are already absolute and serialize
  verbatim. Written `<…>`, with N-Triples escaping.
- **Literals** — `"lexical"^^<datatype>`, with the datatype **always written**.
  RDF 1.1 makes a bare literal implicitly `xsd:string`; permitting both
  spellings would give one literal two canonical forms. Language-tagged literals
  are `"lexical"@tag` with the tag **lowercased** (language tags are
  case-insensitive per BCP 47, so case must not create a second identity).
- **Unicode** — **NFC**, matching the note-path rule in `spec/02` §3.4. One
  normalization form across the whole system.
- **Quoted triples** — `<< s p o >>`, applied **recursively**, using this same
  form for the nested terms. Note that `spec/02` §6.4 excludes nesting on the
  authoring surface, so the recursion terminates at depth 1 for anything the
  mapping engine produces; it is defined generally because import may not.

### 4b. Quad canonical form

`s p o g` — the four canonical terms, space-separated. The **quoted-triple term
in `4a` carries no graph**, which is what makes `spec/02` §6.4's
graph-independent statement identity fall out rather than needing a special
case: two notes annotating the same statement produce the same quoted-triple
term, and their annotation quads differ only in `g`.

### 4c. Blank nodes have no stable identity — a documented limit

`spec/02` §7.1 forbids the mapping engine from minting blank nodes; they exist
only for imported RDF. Blank node labels are **scoped to a parse, not to a
vault**, so a quad containing one cannot satisfy C4: reindexing the same file
may legitimately produce a different label, and the quad's identity changes.

This is a real limit and it MUST be stated rather than discovered. It is also a
concrete argument that `spec/02` §13 #5 (imported RDF) is a genuine spec gap
rather than a deferral: any import path needs a skolemization rule — replace
each blank node with a deterministic vault-local IRI derived from the source
file and its position — before imported data can be indexed at all.

### 4d. The write path should not need keying

The `Map` bug is worth fixing at its cause, not its symptom. Rather than
specifying a canonicalization *so that a `Map` works*, carry occurrences
alongside the quads they belong to:

```ts
interface QuadWithProvenance {
  quad: Quad
  occurrences: Occurrence[]   // ≥ 1 — a quad with none is a bug (spec/02 §8)
}

replaceGraph(g: Term, entries: QuadWithProvenance[]): Promise<void>
```

Keying disappears from the write path entirely, the "same object reference"
contract evaporates, and `spec/02` §10's stated invariant — *"provenance is
passed **with** the quads, so a backend cannot store one without the other"* —
becomes structural rather than a note asking implementers to be careful. That
invariant was already the intent; the signature simply did not express it.

Canonical form is still required for **C1** (dedupe) and **C2**
(`provenance(q)` on the read path), which is where it genuinely belongs.

## 5. Decision gate

Closes at **Phase 2 exit**, when:

1. Golden-file tests emit canonical N-Quads for every fixture note and the
   fixtures are stable across two machines.
2. Dedupe is exercised against the `spec/02` §9 cases — same quad twice in one
   note (collapses, two occurrences), and the same `(s, p, o)` in two notes
   (**does not** collapse, different `g`).
3. A quoted triple annotated from two different notes is confirmed to produce
   one term and two annotation quads.

## 6. Consequences

- `spec/02` §10's `replaceGraph` signature changes per §4d; `Occurrence` and the
  rest of the port are unchanged.
- `spec/02` §9 gains a pointer to this ADR for the definition of "identical."
- `spec/02` §7.1 gains the blank-node limit (§4c), and §13 #5 gains
  skolemization as a named prerequisite.
- Phase 2's golden files are written in canonical N-Quads, which makes the test
  format and the identity rule the same artifact.
