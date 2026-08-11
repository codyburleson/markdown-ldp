---
rdf: property
id: developed
subPropertyOf: schema:creator (inverted)
inverseOf: [[developed by]]
domain: [[Agent]]
range: [[Work]]
---

X developed Y means X was the principal creator of Y, through sustained
intellectual work rather than a single act of authorship.

The prose matters. "Developed" could mean developing a photograph or developing
a disease; only this definition tells a curation pass which `schema:` term the
predicate belongs under (`spec/02` §5.3).

The alignment is **inverted**: this reads subject-first (`Einstein developed
Relativity`), while schema.org points the other way
(`Relativity schema:creator Einstein`).
