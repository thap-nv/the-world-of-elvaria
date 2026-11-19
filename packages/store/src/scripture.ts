// A scripture and the ledger beside it (PS-12c, temple-first plan DB2, ADR 0027): `temple/scripture.md` and
// `temple/scripture.json`, `characters/<id>/scripture.md` and `characters/<id>/scripture.json`. The owner writes the
// Markdown by hand; only the Steward writes the ledger, and the Markdown only to append or take out a line of the Monk
// (ADR 0005). Both writes are atomic. An absent file reads as an empty one: a scripture has no ledger until the first
// temple report touches it.
import { EMPTY_LEDGER, ok } from '@elvaria/domain';
import type { CharacterId, Result, ScriptureFile, ScriptureLedger } from '@elvaria/domain';

import { SCRIPTURE_SPEC } from './entities.ts';
import { fileStore } from './entity-store.ts';
import { readTextFile, writeFileAtomic } from './io/atomic.ts';
import { kingdomLayout } from './layout.ts';
import { inKingdom } from './paths.ts';
import type { StoreIssue } from './issues.ts';

/** The two files of a scripture: `temple`, or a character's id. */
export interface ScriptureStore {
  /** The text and the ledger; an absent file reads as empty, a ledger that cannot be read is an issue. */
  read(owner: string): Promise<Result<ScriptureFile, StoreIssue>>;
  /** The ledger, once its schema accepts it. */
  writeLedger(owner: string, ledger: ScriptureLedger): Promise<Result<ScriptureLedger, StoreIssue>>;
  writeText(owner: string, text: string): Promise<void>;
}

/** Kingdom-relative paths of `owner`'s scripture and ledger. */
export function scripturePaths(owner: string): { readonly text: string; readonly ledger: string } {
  if (owner === 'temple')
    return { text: kingdomLayout.templeScripture(), ledger: kingdomLayout.templeScriptureLedger() };
  // `temple` aside, an owner is a character's id: the path only joins it.
  const id = owner as CharacterId;
  return { text: kingdomLayout.scripture(id), ledger: kingdomLayout.scriptureLedger(id) };
}

export function scriptureStore(root: string): ScriptureStore {
  const ledgerOf = (owner: string) => fileStore(root, SCRIPTURE_SPEC, scripturePaths(owner).ledger);
  return {
    async read(owner) {
      const paths = scripturePaths(owner);
      const text = (await readTextFile(inKingdom(root, paths.text))) ?? '';
      const ledger = await ledgerOf(owner).read();
      if (ledger.ok) return ok({ owner, text, ledger: ledger.value });
      return ledger.error.code === 'not_found' ? ok({ owner, text, ledger: EMPTY_LEDGER }) : ledger;
    },
    writeLedger: (owner, ledger) => ledgerOf(owner).write(ledger),
    writeText: (owner, text) => writeFileAtomic(inKingdom(root, scripturePaths(owner).text), text),
  };
}
