---
rdf: prefixes
prefixes:
  schema: https://schema.org/
  dct:    http://purl.org/dc/terms/
  rdfs:   http://www.w3.org/2000/01/rdf-schema#
  owl:    http://www.w3.org/2002/07/owl#
  skos:   http://www.w3.org/2004/02/skos/core#
  cito:   http://purl.org/spar/cito/
  mldp:   https://markdown-ldp.org/ns#
  ex:     https://vault.local/
---

The vault's prefix map (`spec/02` §4). One map doing three jobs: resolving
predicates and classes, abbreviating note IRIs, and supplying `@base`/`@prefix`
for Turtle output.

Nobody has to open this file. It ships with defaults so that CURIEs work for an
author who never learns what a CURIE is.
