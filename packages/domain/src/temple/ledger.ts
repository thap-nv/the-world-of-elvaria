// A scripture file with the ledger beside it (PS-12c, temple-first plan DB2, ADR 0027 amended): who wrote each line is
// read from both. A line with an id the ledger keeps, not retired, is the Monk's (or from outside); every other line is
// the owner's, whom the machine never edits. An entry no line carries any more, and not retired, is a line the owner
// deleted: no error, only a fact the listing shows.
import { parseScripture } from './parse.ts';
import type { LessonId } from '../core/ids.ts';
import type { ScriptureEntry, ScriptureLedger } from '../schema/lesson/scripture.ts';
import type { ScriptureLine } from './parse.ts';

/** One scripture as the Steward reads it: whose, its text (empty when absent) and its ledger (empty when absent). */
export interface ScriptureFile {
  /** `temple`, or a character's id. */
  readonly owner: string;
  readonly text: string;
  readonly ledger: ScriptureLedger;
}

/** The lessons of the file, parsed. */
export const linesOf = (file: ScriptureFile): readonly ScriptureLine[] =>
  parseScripture(file.text, file.owner).lessons;

export const ledgerEntryOf = (ledger: ScriptureLedger, id: LessonId): ScriptureEntry | undefined =>
  ledger.lessons.find((entry) => entry.id === id);

/** The entry of a line still in the file: kept by the ledger and not taken out; none for the owner's lines. */
export function liveEntryOf(
  line: Pick<ScriptureLine, 'id'>,
  ledger: ScriptureLedger,
): ScriptureEntry | undefined {
  if (line.id === null) return undefined;
  const entry = ledgerEntryOf(ledger, line.id);
  return entry?.retired === undefined ? entry : undefined;
}

/** Who wrote the line: `user` (the owner) unless the ledger keeps it. */
export const sourceOf = (
  line: Pick<ScriptureLine, 'id'>,
  ledger: ScriptureLedger,
): ScriptureEntry['source'] => liveEntryOf(line, ledger)?.source ?? 'user';

/** The Monk's lines of the file: those the ledger says the Monk wrote and that are still there. */
export const monkLinesOf = (file: ScriptureFile): ScriptureLine[] =>
  linesOf(file).filter((line) => liveEntryOf(line, file.ledger)?.source === 'monk');

/** The entries of lines the owner deleted: not retired, and no line of the file carries their id. */
export function deletedByOwnerOf(file: ScriptureFile): ScriptureEntry[] {
  const ids = new Set(linesOf(file).map(({ id }) => id));
  return file.ledger.lessons.filter((entry) => entry.retired === undefined && !ids.has(entry.id));
}
