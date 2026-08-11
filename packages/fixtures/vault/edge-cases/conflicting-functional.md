---
type: [[Person]]
born in: [[Ulm]]
---
A functional predicate with two distinct values.

born in:: [[Munich]]

[[born in]] is declared `functional: true`, so this is a genuine contradiction
rather than a multi-valued fact. Expected behaviour (`spec/01` §8): a validation
warning listing **all** sources, never a silent drop. The parser's job is only
to report both; detecting the conflict needs resolved predicates and belongs to
the mapping engine.
