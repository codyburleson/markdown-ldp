# ADR-0004 — `domain` / `range`: constraint semantics under RDFS names

Status: **LEANING — keep the author-facing field names, emit them as vault-local
`mldp:` terms, never as `rdfs:domain` / `rdfs:range`.** Revisited when Phase 4
decides on SHACL emission.

Context date: 2026-08-10

---

## 1. Why this ADR exists

`spec/02` §5.3 lists `domain:` and `range:` on a predicate-note as *"advisory
typing for Phase-4 validation"*, and `spec/01` §5 uses them the same way — a
range violation is *"object of `developed` not typed `[[Work]]` → range
violation."*

**That is not what those terms mean in RDFS.** `rdfs:domain` and `rdfs:range`
are not constraints. They are **inference rules**. Asserting

```turtle
<predicate/developed> rdfs:domain <notes/Agent> .
```

licenses any reasoner to conclude that **every** subject of `developed` *is* an
`Agent` — not to complain when it isn't. The RDFS semantics are the exact
inverse of the validation behavior both specs describe: where the author expects
a warning, a reasoner produces a new, unasserted, confidently-wrong type.

Nothing in `spec/02` currently says these fields don't export. Under ADR-0002
the other alignment fields *do* lower to real quads, so the default reading is
that these would too. The moment that happens, two faces are affected:

- **R5b** (ADR-0001) — a materialized subgraph handed to a real SPARQL engine
  with RDFS entailment infers types the vault never asserted.
- **The LDP face** — `GET` on a predicate-note publishes those inferences to any
  external consumer.

Both are silent. Both occur at exactly the interop boundary `spec/00` §2 says
LDP conformance exists to serve. And the cost of deciding late is high in an
unusual way: **the field names chosen now commit the semantics**, because
`domain:`/`range:` in frontmatter is what an implementer will map to `rdfs:` by
reflex.

## 2. The options

| | Option | Author-facing name | Exported as | Phase-4 validation |
|---|---|---|---|---|
| **A** | **Keep names, vault-local terms** | `domain:` / `range:` | `mldp:domain` / `mldp:range` | reads the `mldp:` quads |
| **B** | Rename the fields | `expects:` / `accepts:` | `mldp:` terms | same |
| **C** | Emit RDFS, accept the entailment | `domain:` / `range:` | `rdfs:domain` / `rdfs:range` | none — it isn't validation |
| **D** | Emit SHACL | `domain:` / `range:` | `sh:targetClass` / `sh:class` | native |

**C is rejected.** It converts a validation feature into an inference feature
and makes the vault assert types no author wrote. It is also the option that
happens by default if this ADR is never written, which is the reason it exists.

**D is premature.** `spec/02` §13 #1 and `spec/01` §10 #3 both defer SHACL to
Phase 4, and shape validation has not been designed. Committing the export
format before the validation model is decided is backwards. **D remains the
likely Phase-4 destination**, and A is deliberately compatible with it — a
`mldp:range` quad can be compiled to SHACL later without re-authoring a single
note.

**B is honest but costly.** `domain` and `range` are the words users of every
schema language already know, including the LLMs that will read and write these
notes (`spec/02` §5.9). Renaming buys clarity for implementers and spends it on
authors, which inverts the Human-first tie-break (`PLAN` §2).

## 3. Position

**Lean: option A.** Keep `domain:` and `range:` as the author-facing field
names — they are the words people know — and lower them to **`mldp:domain` /
`mldp:range`** per ADR-0002 §5a.

Grounds:

1. **An external reasoner ignores an unknown term; it misreads a known one.**
   This is the same discipline ADR-0002 §5 applies to inverted alignments: emit
   the standard term only where the standard entailment is actually sound.
   Under-claiming is recoverable, overstating is not.
2. **Human-first governs the name, not the IRI.** The author sees `domain:`; the
   IRI is substrate the tool manages (`spec/00` §3). This is precisely the split
   the north-star principle exists to make.
3. **It keeps Phase 4 open.** Nothing here forecloses SHACL; it forecloses only
   the silent, wrong entailment.

**Consequence for `spec/02` §5.3:** the field table's "advisory typing" wording
should say plainly that these are **constraints, not RDFS inference**, and point
here. The distinction is the whole content of this ADR and it is invisible in
the current phrasing.

## 4. Revisit

At **Phase 4 entry**, with the shape/validation model in hand: decide whether
`mldp:domain`/`mldp:range` compile to SHACL for export (option D), and whether
class-note shapes (`requires::` / `allows::`, `spec/01` §5) join them. That is
the natural moment — the question is "what is our constraint language", and
answering it for `domain`/`range` alone would be answering it twice.
