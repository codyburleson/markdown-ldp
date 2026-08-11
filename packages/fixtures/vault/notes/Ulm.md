---
type: [[Place]]
sameAs: https://www.wikidata.org/entity/Q3013
---
A city in Baden-Württemberg, Germany.

`sameAs:` is how a note points at an external identity (`spec/02` §3.2). This
note's own IRI stays vault-local; saying it *is* the Wikidata entity would make
the LDP face unable to serve it, and would confuse a document with a place.

The umlaut in the body is deliberate — NFC normalisation is specified in §3.4
and needs a real character to exercise it.
