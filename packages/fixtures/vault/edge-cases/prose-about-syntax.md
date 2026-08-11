---
type: [[Work]]
---
A note that *discusses* the authoring syntax without using it.

- `field:: [[Physics]]` — a typed statement about this note
- `((developed))` — a fenced predicate
- `[[A]] [[p]] [[B]]` — the three-link shorthand
- `~(confidence:: 0.9)` — statement metadata

None of the above may mint a quad. Inline code is prose about the syntax, not
an assertion in it — the same restraint `spec/02` §6.5 applies to plain
wikilinks. A parser that indexes documentation indexes its own README.

```markdown
type: [[Person]]
developed:: [[Something]]
```

Fenced blocks are skipped for the same reason.

The one real statement on this page:

((supports)) [[Relativity]]
