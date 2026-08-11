---
rdf: property
id: author
subPropertyOf: schema:creator
domain: [[Work]]
range: [[Agent]]
---

X author Y means Y wrote X.

Aligned in the **same** direction as `schema:creator`, unlike [[developed]] —
which is why the `(inverted)` marker has to be per-alignment rather than a
global convention (`spec/02` §5.5).

Together with [[developed]] this is the fragmentation case from `spec/02` §5.1
in miniature: two vault-local predicates, near-synonyms to a reader, unrelated
to a query engine until they are aligned to a shared parent.
