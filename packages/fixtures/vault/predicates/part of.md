---
rdf: property
id: part-of
subPropertyOf: schema:isPartOf
inverseOf: [[has part]]
---

Y part of X — the inverse of [[has part]].

The pair forms a two-cycle under `inverseOf`, which is legitimate and must not
be mistaken for the cycle `spec/02` §5.4 requires us to break. That rule is
about the `subPropertyOf` hierarchy; inverses are expected to point at each
other.
