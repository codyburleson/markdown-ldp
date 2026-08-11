---
type: [[Work]]
---
External IRIs and what does not become one.

((supports)) [Relativity on Wikipedia](https://en.wikipedia.org/wiki/Theory_of_relativity)

A naked URL stays prose: https://example.org/not-a-term — and so does an
autolink, <https://example.org/also-not>. Only the explicit `[label](target)`
form is a term (`spec/01` §4.1.2).

The label is display text, not a claim about the resource's name, so it is not
asserted as `rdfs:label` by default (`spec/02` §3.7).
