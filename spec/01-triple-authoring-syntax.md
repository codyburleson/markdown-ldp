# Triple Authoring & Typing — Mini-Spec (DRAFT v0.1)

Status: **Draft / for discussion.** This document explores how a human writes
semantically meaningful triples inside Obsidian-flavored Markdown, and how
entity types are established via templates, frontmatter, and tags. Decision
points requiring the author's input are marked **[DECIDE]**.

Related docs (to be written): `00-vision.md`, `02-data-model.md` (RDF mapping &
identity), `03-ldp-http.md`, ADRs.

---

## 1. Goals

1. Let a user express **subject–predicate–object** statements in Markdown that
   read naturally and render acceptably in Obsidian's reading view.
2. Work on **plain Markdown** — no Obsidian required to *read/parse* a vault
   (Obsidian conventions are the starting dialect, not a hard dependency).
3. Make **types/classes** first-class via templates + class-notes, so the graph
   carries a schema an AI (or a validator) can rely on.
4. Let **tags** carry lightweight, workflow-oriented meaning without corrupting
   the formal type system.
5. Preserve **provenance**: every triple traces back to `(file, line, span)`.

Non-goals (this doc): the RDF/IRI minting rules, the SQLite index, the HTTP
surface. Those live in `02-data-model.md`+.

---

## 2. The layered model

Three layers, from most implicit to most explicit:

| Layer | Mechanism | Establishes |
|-------|-----------|-------------|
| **A. Note-as-subject** | frontmatter + `key:: value` inline fields | triples whose subject is *this note* |
| **B. Statements** | inline `(( ))` statements + `triple` blocks | triples whose subject is *any* resource |
| **C. Typing** | templates ⇄ class-notes; tag mapping | `rdf:type`, schema/shape, soft classification |

A vault can use only Layer A and already be a knowledge graph. B and C add
expressive power and schema.

---

## 3. Layer A — Note as subject (baseline, zero new syntax)

The current note is the implicit subject. Frontmatter keys and Dataview-style
inline fields (`key:: value`) become predicate–object pairs.

```markdown
---
type: [[Person]]
born: 1879-03-14
---
Albert Einstein, theoretical physicist.

field:: [[Physics]]
developed:: [[Theory of Relativity]]
```

Yields (subject = this note, `ex:Einstein`):

```turtle
ex:Einstein a ex:Person ;
    ex:born "1879-03-14"^^xsd:date ;
    ex:field ex:Physics ;
    ex:developed ex:Theory_of_Relativity .
```

Rules:
- A `[[wikilink]]` value → an **IRI** (resource object).
- A bare scalar → a **literal**; datatype inferred (date, integer, boolean),
  else `xsd:string`. **[DECIDE]** inference aggressiveness.
- Repeated keys or list values → multiple triples (same predicate).
- Predicate name → an IRI in the vocab namespace (see `02-data-model.md`).

---

## 4. Layer B — Statements (subject need not be the note)

### 4.1 Inline statement — the `(( ))` predicate marker

Write a sentence-like statement anywhere in prose. The predicate is wrapped in
`(( ))`; subject and object are the flanking links/values.

```markdown
[[Einstein]] ((developed)) [[Theory of Relativity]]
```

→ `ex:Einstein ex:developed ex:Theory_of_Relativity .`

- Subject and object may be `[[links]]` (IRIs) or `"quoted"` literals.
- The predicate `((developed))` also resolves as a link to `developed.md`
  (a **predicate-note**, §6), enabling autocomplete and definition-on-hover.
- Reads as English; in reading view we can style `(( ))` as a subtle chip.

**DECIDED: `(( ))`.** Chosen for visual distinctness and safety against
collisions with Obsidian (`[[ ]]`, `![[ ]]`, `%% %%`, `$ $`, `#`,
`==highlight==`), Dataview (`:: `), and Templater (`{{ }}`). Alternatives
considered and rejected: `{ }` (Templater clash), `-pred->` (ambiguous to parse
in free prose), `:pred:` (emoji shortcode clash).

### 4.2 Statement-level metadata (RDF-star / RDF 1.2)

A trailing parenthetical annotates the *statement* (provenance, confidence,
qualifiers) — the feature that makes the graph trustworthy to an AI.

```markdown
[[Einstein]] ((developed)) [[Theory of Relativity]] (source:: [[Pais 1982]], confidence:: 0.95)
```

→ (RDF-star)
```turtle
<< ex:Einstein ex:developed ex:Theory_of_Relativity >>
    ex:source ex:Pais_1982 ;
    ex:confidence 0.95 .
```

### 4.3 Triple blocks (bulk / Turtle-flavored)

For many statements about one subject, or when prose would be noise:

````markdown
```triple
[[Einstein]]
  ((developed)) [[Theory of Relativity]] ;
  ((won)) [[Nobel Prize in Physics]] (year:: 1921) ;
  ((born in)) [[Ulm]] .
```
````

Semicolon = same subject; period = end. This is deliberately Turtle-like so it
can grow toward embedding real Turtle later. **[DECIDE]** whether to also accept
raw ` ```turtle ` blocks verbatim.

---

## 5. Templates as classes (the schema)

A **class-note** defines a type and its shape. A **template** is its
constructor. An **instance** is a typed subject.

`classes/Person.md`:

```markdown
---
rdf: class
subClassOf: [[Agent]]
---
A human being.

# Shape
requires:: [[born]], [[field]]
allows:: [[developed]], [[knows]]
range of developed:: [[Work]]
```

`templates/Person.md` (Templater/core template) scaffolds an instance:

```markdown
---
type: [[Person]]
born:
---

field::
```

Instantiating → a subject with `type:: [[Person]]`; filled fields become
schema-blessed triples. The class-note's shape enables **validation**:
- missing `requires` predicate → warning;
- object of `developed` not typed `[[Work]]` → range violation.

**[DECIDE]** how strict validation is (advisory vs blocking) and whether shapes
compile to real **SHACL** for interop.

---

## 6. Predicate-notes (the vocabulary)

Predicates referenced as `((developed))` / `developed::` resolve to notes under
e.g. `predicates/developed.md`:

```markdown
---
rdf: property
inverseOf: [[developed by]]
domain: [[Agent]]
range: [[Work]]
---
X developed Y means X was the principal creator of Y.
```

This puts the **ontology in the vault as notes** — linkable, hover-previewable,
AI-readable, and the source for authoring autocomplete. Unknown predicates are
allowed but flagged as "undefined vocabulary" (a gentle nudge, not an error).

---

## 7. Tags — deliberately left alone (for now)

**DECIDED: tags produce no triples by default.** Guiding principle:

> **Predicates carry the formal semantics; documents are the subjects and
> objects; tags stay free.**

Obsidian tags keep doing their fast, informal, human job (filtering, workflow
state, ad-hoc grouping). We do **not** overload `#tags` with RDF/SKOS meaning,
because that would blur the line between casual tagging and formal knowledge and
tempt users to encode semantics in a place that has no shape or definition.

### 7.1 Future direction — a dedicated SKOS layer (separate mechanism)

Rather than reinterpreting `#tags`, a later phase will add **first-class SKOS
concepts** as their own thing:
- **Concept-notes** (`skos:Concept`, with `broader`/`narrower`/`related`),
  authored like predicate- and class-notes.
- A purpose-built, **SKOS-centric tagging UI** for Obsidian (its own affordance,
  possibly a new tag-like token) so classification is explicit and navigable —
  distinct from free `#tags`.

This is a planned direction, not a maybe. Tracked for a post-core phase; out of
scope for the authoring core.

### 7.2 Escape hatch

A user who *wants* tag-derived triples can opt in via config (e.g. promote a
namespace `#type/* → rdf:type`, or map `#k/v → k:: v`). Off by default.

---

## 8. Normalization & precedence (resolving synonymy)

The same fact can be stated ≥3 ways (template `type::`, `#type/x` tag, an inline
`((a)) [[Class]]`). All MUST normalize to one canonical triple. Proposed
precedence for typing, highest first:

1. Explicit `type::` / frontmatter `type` (template output).
2. Inline `(( ))` type statement.
3. Promoted tag namespace (`#type/*`).
4. Inferred (none — never invent a type).

Duplicate triples from multiple sources collapse to one, but **provenance keeps
all source spans** so the UI can show "asserted in 3 places."

---

## 9. Worked end-to-end example

`notes/Relativity.md`:

````markdown
---
type: [[Work]]
year: 1915
tags: [physics]
---
The theory of relativity.

author:: [[Einstein]]

[[Relativity]] ((influenced)) [[GPS]] (confidence:: 0.8)

```triple
[[Relativity]]
  ((has part)) [[Special Relativity]] ;
  ((has part)) [[General Relativity]] .
```
````

Canonical triples (abbreviated):

```turtle
ex:Relativity a ex:Work ;
    ex:year 1915 ;
    ex:author ex:Einstein ;
    # note: `tags: [physics]` yields NO triple by default (§7)
    ex:has_part ex:Special_Relativity, ex:General_Relativity .
<< ex:Relativity ex:influenced ex:GPS >> ex:confidence 0.8 .
```

---

## 10. Decisions log

Decided:
- **Inline delimiter → `(( ))`.** (§4.1)
- **Tags left alone; no triples by default.** Dedicated SKOS layer + UI is a
  planned later phase, separate from `#tags`. (§7)

Still open:
1. Literal datatype inference aggressiveness. (§3)
2. Accept raw ` ```turtle ` blocks in addition to ` ```triple `. (§4.3)
3. Validation strictness (advisory vs blocking) and SHACL emission. (§5)
4. Whether predicate/class notes live in reserved folders or are found by a
   frontmatter marker (`rdf: property` / `rdf: class`) regardless of location.
   (§6)
