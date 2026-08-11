# @markdown-ldp/fixtures — the reference vault

One shared test corpus for the whole project. Parser, mapping engine, store and
the four faces all test against **this** vault rather than inline string
literals, so every layer is describing the same world.

```ts
import { loadVault, loadNote, loadCleanNotes, loadEdgeCases } from '@markdown-ldp/fixtures'
```

## Layout

| Path | What it holds |
|---|---|
| `vault/vocabulary/` | The prefix map (`spec/02` §4) |
| `vault/predicates/` | Predicate-notes — alignments, inverses, one deliberately unaligned |
| `vault/classes/` | Class-notes and a small type hierarchy |
| `vault/notes/` | Ordinary content — a little physics knowledge graph |
| `vault/edge-cases/` | Inputs that exercise diagnostics and the awkward rules |

**This documentation lives outside `vault/` on purpose.** Everything under
`vault/` is content: a README inside a vault is just another note, and would be
indexed as one.

## Two rules for changing it

**`notes/Relativity.md` is the `spec/02` §11 worked example, byte for byte.**
Do not edit it to make a test pass. If the spec's example changes, change it
here to match — the point is that the fixture and the specification cannot
drift apart silently.

**`edge-cases/` is expected to produce diagnostics.** A corpus of only
well-formed documents tests the happy path and calls it done. Notes there
deliberately contain unclosed frontmatter, functional-predicate conflicts,
dangling links, and prose that merely discusses the syntax.

## Golden files

`packages/core/test/__golden__/parse-vault.txt` records what the parser
currently produces for every note. Regenerate after an intentional change:

```
yarn workspace @markdown-ldp/core run golden
```

Then **read the diff** — that is the whole value of the mechanism. A golden
file regenerated without being read is a test that asserts the code does what
the code does.

At Phase 2 exit these become canonical N-Quads, which per ADR-0003 §5 makes the
test format and the quad identity rule the same artifact.
