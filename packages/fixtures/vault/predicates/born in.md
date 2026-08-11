---
rdf: property
id: born-in
subPropertyOf: schema:birthPlace
functional: true
domain: [[Person]]
range: [[Place]]
---

X born in Y — the place X was born.

**Functional** (`spec/01` §8): a person has one birthplace, so two distinct
values for the same subject is a genuine contradiction rather than a
multi-valued fact. The rule is a warning listing every source, never a silent
drop — see [[conflicting-functional]] in the edge cases.
