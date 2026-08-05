# Triple Authoring & Typing — Mini-Spec (DRAFT v0.2)

Status: **Draft / for discussion.** This document explores how a human writes
semantically meaningful triples inside Obsidian-flavored Markdown, and how
entity types are established via templates, frontmatter, and tags. Decision
points requiring the author's input are marked **[DECIDE]**.

**v0.2 revision (2026-08-04):** scrutiny pass on writability & narrative-blend.
Added a **layered blend model** (standalone core now, prose-woven annotation as a
later power-user layer), **implicit subject** for statements about the current
note, a **three-link positional shorthand** to cut the shift-key cost of `(( ))`,
a **distinct statement-metadata token `~( … )`**, **external Markdown links as
IRIs** (`[label](url)` → external IRI; a URL *is* an IRI), an **authoring
maturity ladder** (M1 single-line → M2 in-prose → M3 annotated), and reclassified
`triple`/Turtle blocks as an explicit power-user layer. Governing constraint
throughout: **Human-first, RDF-hidden** (see `00-vision.md` §3 and `PLAN.md` §2).

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

**Value forms** (shared with Layer B, §4.1.2):
- A `[[wikilink]]` value → an **internal IRI** (resource object).
- A Markdown link `[label](target)` value → an **IRI** too: an absolute-URI
  target (`https://…`, `mailto:…`) is an **external IRI** used verbatim; a vault
  path (`./Note.md`) resolves like a wikilink to an **internal IRI**. See §4.1.2.
- A bare scalar → a **literal**; datatype inferred (date, integer, boolean),
  else `xsd:string`. **[DECIDE]** inference aggressiveness.
- Multiple objects: a repeated key, a YAML list, or a comma-separated `::` value
  (`field:: [[A]], [[B]]`) → **multiple triples** (same predicate). **[DECIDE]**
  confirm comma-splitting for inline `::` fields (Dataview does not always split).

### 3.1 Which keys become triples (frontmatter hygiene)

**Not every frontmatter key is a statement.** Blindly mapping all keys would mint
nonsense triples from configuration. Default policy:

- **Reserved keys are ignored** — a built-in denylist of Obsidian/ecosystem
  config keys: `tags`, `aliases`, `cssclasses`, `publish`, `permalink`,
  `created`/`updated`, and tool-owned blocks (Templater, etc.). User-configurable.
- **`tags` yields no triples** here, consistent with §7 (and §9's example).
- **`type` — and Turtle's `a` — is the reserved typing key** → `rdf:type` (§8).
- Every **other** key maps to a predicate in the vault vocabulary. Unknown
  predicates are allowed but flagged as "undefined vocabulary" (§6), never errors.
- **CURIE keys are allowed** for power users: `dct:creator:: [[X]]` (or
  frontmatter `dct:creator:`) targets that vocabulary directly via the prefix-map.
- **One datatype-inference path.** To avoid frontmatter-YAML vs Dataview-string
  divergence, inference runs on the value's **string form** by one shared rule, so
  `born: 1879` and `born:: 1879` yield the *same* typed literal.
- Key/predicate slugging (spaces, case) follows the identity rules in
  `02-data-model.md`.

---

## 4. Layer B — Statements (subject need not be the note)

### 4.0 Authoring maturity ladder (M1 → M2 → M3)

Statements graduate through three stages of *embedding*. We implement them in
order; each is a superset of the last.

| Stage | Where a statement may appear | Parser unit | Status |
|-------|------------------------------|-------------|--------|
| **M1** | On **its own line** (the whole line is the statement) | the line | **initial target** |
| **M2** | **Embedded in a paragraph**, mid-sentence, surrounded by prose | a span within text | later |
| **M3** | **Annotated onto words already in a sentence** — roles marked in place, the triple *inferred* rather than restated (loosely coupled) | annotated spans | future |

The forms in §4.1 are **stable across stages**; what changes is only whether a
statement may sit inside surrounding prose. **We build M1 first** — it's the
cheapest to parse (line = unit) and already delivers the entire model.

Crucially, the **statement-metadata token (§4.2) is chosen now to survive all
three stages.** Once statements live inside prose (M2/M3), plain `( )` parens are
hopelessly ambiguous with ordinary asides — so metadata gets its own
unmistakable token from day one, even though M1 alone wouldn't strictly require
it. This is the "decide the durable token early" principle.

### 4.1 Inline statement — three ergonomic forms

We keep `(( ))` as the **canonical, collision-safe** predicate marker and add
lighter forms for the common cases. **All three normalize to the same triple.**
The design principle: match the ceremony to the risk — heavy fencing only where
prose can actually collide with it.

**(a) Implicit subject — the default (subject = the current note).**
In a note that *is* the subject, don't restate it. A Dataview-style inline field
already does this with **no new syntax**:

```markdown
developed:: [[Theory of Relativity]]
```

→ `ex:ThisNote ex:developed ex:Theory_of_Relativity .` Renders natively in
Obsidian/Dataview; the only shifted keys are `::`. This is the lightest way to
state a fact about the current note and should be the path most authors use most
of the time. (This makes Layer A and Layer B the *same* mechanism when the
subject is the note — see §3.)

**(b) Inline, subject ≠ current note — canonical `(( ))`.**
When the subject is something else and you're writing mid-prose:

```markdown
[[Einstein]] ((developed)) [[Theory of Relativity]]
```

The `(( ))` earns its keystroke cost *here*: it fences the predicate
unambiguously inside running prose. The predicate `((developed))` also resolves
as a link to `developed.md` (a **predicate-note**, §6).

> **Requirement (not optional):** the Obsidian plugin MUST provide predicate
> autocomplete — typing `((` opens a picker backed by predicate-notes and
> inserts `((developed)) `. `(( ))` is four **shifted** keystrokes on the
> highest-frequency token in the system; without autocomplete it is too
> expensive for its frequency, and that cost is the price of collision-safety.

**(c) Positional shorthand — three adjacent wikilinks (whole-line only).**
A lighter alias for (b): **no shifted keys, full autocomplete on all three
tokens** (all are `[[ ]]` links):

```markdown
[[Einstein]] [[developed]] [[Theory of Relativity]]
```

Rule: **exactly three** wikilinks separated only by whitespace, occupying a
**whole line** with no other prose = S–P–O; the **middle** link is the predicate
(resolves to a predicate-note). Two links on their own line
(`[[developed]] [[O]]`) = the implicit-subject shorthand for form (a). Restricting
this to a dedicated line keeps the adjacency rule from misfiring on ordinary
prose. This is opt-in fast-entry for power typists.

**Parsing & termination (all inline forms):**
- A statement is terminated by **end-of-line**; a `(( ))` statement and its
  S/O MUST sit on one line. `(( ))` may not straddle a line break.
- At most **one** `(( ))` predicate per statement; the flanking tokens are its
  subject and object.
- Subject/object may be `[[wikilinks]]` or `[md links](url)` (→ IRIs) or
  `"quoted"` literals. Resource-reference rules: §4.1.2.
- Reading view: the plugin styles forms (b)/(c) as a subtle chip so they blend
  with prose. In **plain Markdown** (no plugin) they stay legible but unstyled —
  an accepted trade-off of the plain-Markdown goal (`00-vision.md` §3).

**DECIDED: `(( ))` remains canonical** (collision-safety vs Obsidian `[[ ]]`,
`![[ ]]`, `%% %%`, `$ $`, `#`, `==highlight==`; Dataview `:: `; Templater
`{{ }}`). Rejected delimiters unchanged: `{ }` (Templater clash), `-pred->`
(ambiguous in free prose), `:pred:` (emoji shortcode clash). **Added in v0.2:**
implicit-subject via `::` (a) and the three-link positional shorthand (c).

### 4.1.1 Woven prose annotation — *later power-user layer (out of scope for the core)*

Forms (a)–(c) are **standalone, sentence-like** statements. A distinct, harder
goal is annotating words **inside a sentence you already wrote** ("Einstein
*developed* the theory of relativity" where *developed* is marked as a predicate
in place, without restating subject/object as separate tokens). Per the
**both-layered** decision, this is a planned **power-user** layer added *after*
the standalone core, not part of the initial authoring surface. Tracked here so
the core parser leaves room for it; **not** specified yet.

### 4.1.2 Resource references — internal vs external IRIs

A subject or object that denotes a **resource** (not a literal) may be written
two ways; both render as clickable links.

| Written | Resolves to | Renders in |
|---------|-------------|-----------|
| `[[Einstein]]` | **internal** IRI (a vault note, via `02` identity rules) | Obsidian only |
| `[[Einstein#Youth]]` | internal IRI with fragment (a sub-resource) | Obsidian only |
| `[label](https://…)` | **external** IRI = the URL, used verbatim | Obsidian **and** plain Markdown |
| `[label](./Physics.md)` | **internal** IRI (path resolves to a vault note) | Obsidian **and** plain Markdown |
| `"1879"` / bare scalar | a **literal**, not a resource | — |

This is exactly right in RDF terms: **a URL *is* an IRI.** External Markdown
links are how a vault joins the **global** web of Linked Data — `owl:sameAs` to
Wikidata, `schema:` types, citations to real documents — which is the reach the
AI face ultimately traverses. Bonus: `[label](url)` renders as a link in *plain*
Markdown too (unlike `[[wikilinks]]`), so external references stay portable
outside Obsidian.

Rules:
- **Resolution:** a Markdown link is **external** iff its target is an absolute
  URI (has a scheme — `http:`, `https:`, `mailto:`, `urn:`, …); otherwise the
  target is a **vault path** and resolves like a wikilink to an internal IRI.
- **Identity vs label:** the **URI is the identity**; the link **label is display
  only**. **[DECIDE]** whether to *also* assert the label as `rdfs:label` on the
  external IRI (provenance-scoped to this note-graph) — handy for the AI face,
  but it mints a triple the author didn't explicitly write. *Lean: off by
  default, opt-in.*
- **No accidental triples:** naked/autolinked URLs in prose (`https://…` or
  `<https://…>`) are **not** parsed as subjects/objects — only the explicit
  `[label](url)` form is. Ordinary hyperlinks in your writing stay prose.
- **Predicates stay curated:** a predicate is still `((word))` resolving via the
  prefix-map / predicate-notes (§6), **never** an inline Markdown link. External
  predicate IRIs arrive through the vault prefix-map (CURIEs), keeping the
  vocabulary defined rather than ad-hoc.

### 4.2 Statement-level metadata (RDF-star / RDF 1.2)

A trailing parenthetical annotates the *statement* (provenance, confidence,
qualifiers) — the feature that makes the graph trustworthy to an AI.

```markdown
[[Einstein]] ((developed)) [[Theory of Relativity]] ~(source:: [[Pais 1982]], confidence:: 0.95)
```

→ (RDF-star)
```turtle
<< ex:Einstein ex:developed ex:Theory_of_Relativity >>
    ex:source ex:Pais_1982 ;
    ex:confidence 0.95 .
```

**DECIDED (v0.2): statement-metadata uses a distinct token — `~( … )`.**
A tilde-marked parenthetical, chosen so it is
**unmistakable** against a prose aside `(like this)`, the predicate `(( ))`, and
a link `[[ ]]`. The whole point is to leave **no doubt**: ordinary prose
parentheses are *never* parsed as metadata.

Rules:
- `~( … )` binds to the statement it **immediately follows** — an RDF-star
  annotation *about that statement*.
- Contents are comma-separated `key:: value` pairs (Dataview-style); values may
  be `[[links]]` or literals.
- The leading `~` is the disambiguator; without it, a trailing `( … )` is prose.

Why a distinct token (not a heuristic): once statements are embedded in prose
(§4.0, M2/M3), plain `( )` collides with ordinary asides. Deciding the durable
token now means the metadata syntax never has to change as authoring matures.

*Rejected:* plain `( )` + adjacency/`::` heuristic (too subtle once
prose-embedded); `<< … >>` (matches RDF-star literally, but four shifted keys and
collides with HTML/autolinks).

### 4.3 Triple blocks (bulk / Turtle-flavored) — *power-user layer*

> **Progressive disclosure.** This form reintroduces Turtle punctuation (`;` to
> continue, `.` to terminate) — i.e. a sliver of real RDF literacy. Per
> **Human-first** it is an **explicit power-user affordance**, not part of the
> layman path. The core layman surface is Layer A + inline forms (a)/(c). The
> `triple` block is for authors who want to enter many statements at once.

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

## 8. Normalization, deduplication & conflict handling

Every authoring form (§3–§6) lowers to canonical quads `(s, p, o, g)`. This
section defines what happens when the **same** or **conflicting** facts arrive
from different syntaxes.

**Canonicalize → dedupe.** All forms normalize to quads; **identical** quads
collapse to one, but provenance **retains every source span** (so the UI can show
"asserted in 3 places"). This is the common case and needs no precedence.

**Multi-valued by default.** RDF predicates are multi-valued: distinct objects for
the same `(s, p)` are **all kept** — they are not competitors. In particular
**`rdf:type` is multi-valued** — a subject may be `[[Person]]` *and* `[[Agent]]`,
and we assert both.
> *Correction from v0.1:* the old "typing precedence, highest wins" was **wrong** —
> it discarded valid types. Typing is multi-valued; there is no winner to pick.

**Functional predicates → conflict = warning, never a silent drop.** A
predicate-note MAY declare itself **functional** (single-valued, e.g. `born`). If
distinct values then arrive for the same subject, that is a genuine
*contradiction*: surface a **validation warning** (§5) listing all sources. An
optional, documented **tie-break** MAY mark a "primary" for display but MUST NOT
discard the others. Default tie-break, highest first:
1. Explicit inline field `p:: …` / frontmatter `p:`.
2. Inline `(( ))` / three-link statement.
3. Tag-derived — **only if** promotion is enabled (§7.2); always lowest.

**Predicate/label synonymy is a vocabulary concern, not this section's.** Whether
`author::` and `((creator))` denote the *same* predicate is decided by the
vocabulary layer — predicate-notes sharing an IRI/CURIE or declaring
`owl:equivalentProperty` (§6, `02-data-model.md`). §8 dedupes/handles quads only
*after* predicates have resolved to IRIs.

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

((influenced)) [[GPS]] ~(confidence:: 0.8)

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
- **Inline delimiter → `(( ))` canonical.** (§4.1)
- **Blend model → both, layered.** Standalone sentence-like forms are the core
  now; woven-into-prose annotation is a later power-user layer (§4.1.1). (v0.2)
- **Keep `(( ))` + add a shorthand.** Implicit-subject `::` (a) and three-link
  positional shorthand (c) reduce keystrokes; `(( ))` stays for in-prose,
  subject-≠-note statements. (§4.1, v0.2)
- **Plugin autocomplete for `((` is a requirement,** not a nicety — it's what
  makes the shift-heavy `(( ))` affordable. (§4.1, v0.2)
- **`triple`/Turtle blocks are an explicit power-user layer,** off the layman
  path. (§4.3, v0.2)
- **Authoring maturity ladder M1 → M2 → M3.** Single-line statements first;
  prose-embedded next; annotated-in-prose (inferred) last. **Build M1 first.**
  (§4.0, v0.2)
- **Statement-metadata gets a distinct, durable token → `~( … )`** (confirmed),
  chosen now to survive prose-embedding. (§4.2, v0.2)
- **External Markdown links are IRIs.** `[label](url)` in subject/object position
  → an external IRI (a URL *is* an IRI); vault-path md-links resolve internally
  like wikilinks. Bridges the vault to the global Linked Data web. (§4.1.2, v0.2)
- **Tags left alone; no triples by default.** Dedicated SKOS layer + UI is a
  planned later phase, separate from `#tags`. (§7)
- **Frontmatter hygiene.** Not every key is a triple: a reserved-key denylist
  (`tags`, `aliases`, `cssclasses`, `publish`, `permalink`, `created`/`updated`,
  tool-owned blocks) is ignored by default; `type`/`a` is the reserved typing
  key; CURIE keys allowed; one shared datatype-inference path. (§3.1, v0.2)
- **§8 corrected — typing is multi-valued.** Dedupe identical quads (keep
  provenance); keep all distinct objects; `rdf:type` may have several values (no
  precedence winner). Conflicts only exist on **declared-functional** predicates →
  warning + optional tie-break, never a silent drop. Predicate synonymy is a
  vocabulary-layer concern, not §8. (§8, v0.2 — fixes a v0.1 correctness bug)

Still open:
1. Literal datatype inference aggressiveness — and confirm comma-splitting for
   inline `::` fields (`field:: [[A]], [[B]]`). (§3, §3.1)
2. Accept raw ` ```turtle ` blocks in addition to ` ```triple `. (§4.3)
3. Validation strictness (advisory vs blocking) and SHACL emission. (§5)
4. Whether predicate/class notes live in reserved folders or are found by a
   frontmatter marker (`rdf: property` / `rdf: class`) regardless of location.
   (§6)
5. **External-link label → `rdfs:label`?** Whether a Markdown link's display text
   is asserted as a label on the external IRI (opt-in vs off by default). (§4.1.2)
6. **Three-link shorthand:** confirm the whole-line, exactly-three-links rule is
   the shorthand we want (vs. a different lightweight alias). (§4.1c, new in v0.2)
