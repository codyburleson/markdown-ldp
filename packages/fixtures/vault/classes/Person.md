---
rdf: class
id: Person
subClassOf: [[Agent]]
equivalentClass: schema:Person
---

A human being.

# Shape

requires:: [[born in]]
allows:: [[developed]], [[author]]

Shape validation is Phase 4 and advisory first (`spec/01` §5). Whether these
compile to SHACL is open, and coupled to ADR-0004 — `domain`/`range` are
constraints wearing RDFS inference names, and both questions want one answer.
