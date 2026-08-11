---
type: [[Work]]
---
Bulk entry — the power-user layer (`spec/01` §4.3).

```triple
[[Einstein]]
  ((developed)) [[Relativity]] ;
  ((born in)) [[Ulm]] ;
  ((author)) [[Annus Mirabilis Papers]] .
```

A second block, deliberately broken mid-way, to exercise `spec/02` §6.3: a
parse error is reported with `(file, line)` and must not abort the rest of the
file. The valid clauses either side of the bad one still yield their quads.

```triple
[[Relativity]]
  ((has part)) [[Special Relativity]] ;
  ((has part)) ;
  ((has part)) [[General Relativity]] .
```

developed:: [[Something Else]]
