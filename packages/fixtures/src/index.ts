/**
 * The reference vault — one shared test corpus for the whole project.
 *
 * Every package tests against *this* vault rather than inline string literals,
 * so parser, mapping engine, store and the four faces are all describing the
 * same world. When a spec rule changes, one corpus changes with it.
 *
 * Two properties are deliberate and worth preserving:
 *
 * 1. **It is a real vault.** Everything under `vault/` is content — notes,
 *    predicate-notes, class-notes, a prefix map. Documentation *about* the
 *    fixture lives in `packages/fixtures/README.md`, outside the vault root,
 *    because a README inside a vault is just another note and would be indexed
 *    as one.
 *
 * 2. **It contains deliberately broken notes.** `edge-cases/` holds inputs that
 *    must produce diagnostics. A corpus of only well-formed documents tests the
 *    happy path and calls it done.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Absolute path to the vault root. */
export const VAULT_ROOT = fileURLToPath(new URL('../vault/', import.meta.url))

export interface VaultNote {
  /** Vault-relative path with POSIX separators — the form `spec/02` §3.2 uses. */
  path: string
  source: string
}

/** Vault-relative paths of the notes that are *expected* to parse cleanly. */
export const CLEAN_DIRS = ['classes/', 'notes/', 'predicates/', 'vocabulary/']

/** Vault-relative paths of notes that deliberately exercise failure modes. */
export const EDGE_CASE_DIR = 'edge-cases/'

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, found)
    else if (entry.name.endsWith('.md')) found.push(full)
  }
  return found
}

/**
 * Every note in the vault, sorted by path.
 *
 * Sorting matters: golden files compare rendered output, and directory order
 * is filesystem-dependent. An unsorted corpus produces diffs that depend on
 * which machine ran the test.
 */
export function loadVault(): VaultNote[] {
  return walk(VAULT_ROOT)
    .map((absolute) => ({
      path: relative(VAULT_ROOT, absolute).split(sep).join('/'),
      source: readFileSync(absolute, 'utf8'),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/** One note by vault-relative path. Throws if it is missing — a test naming a
 *  note that no longer exists should fail loudly, not silently pass. */
export function loadNote(path: string): VaultNote {
  const source = readFileSync(join(VAULT_ROOT, path), 'utf8')
  return { path, source }
}

/** The notes expected to parse without diagnostics. */
export function loadCleanNotes(): VaultNote[] {
  return loadVault().filter((n) => CLEAN_DIRS.some((d) => n.path.startsWith(d)))
}

/** The notes that deliberately exercise diagnostics and edge cases. */
export function loadEdgeCases(): VaultNote[] {
  return loadVault().filter((n) => n.path.startsWith(EDGE_CASE_DIR))
}
