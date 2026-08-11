---
rdf: property
id: developed-by
inverseOf: [[developed]]
domain: [[Work]]
range: [[Agent]]
---

Y developed by X — the inverse of [[developed]].

Declared, never materialised. `spec/02` §5.6: the indexer stores only the
asserted direction and the query layer resolves the inverse, because a
materialised inverse quad's provenance would be a lie — there is no
`(file, line, span)` where anyone wrote it.

The filename carries a space, which is the point: it exercises the
percent-encoding rule in `spec/02` §3.4 and the `-`/`_`/space equivalence in
§5.11.
