// A temple report as a whole (PS-12c, temple-first plan DB7 as the owner settled it, ADR 0027): the Monk edits single
// lines, it never replaces a scripture. A report that adds more than TEMPLE_ADDS_MAX lines, or takes out of one file more
// than half of the Monk's lines there (TEMPLE_REMOVALS_FLOOR at least, so merging two is always possible), is refused
// whole before anything is written. The ids its new lines get come from the report itself, as a memo's id comes from its
// quest and text (memoKeyOf, memoIdOf): the Steward hashes the key, so a report applied again names the same lines.
import { formatDatedId } from '../core/id-source.ts';
import { err, ok } from '../core/result.ts';
import {
  TEMPLE_ADDS_MAX,
  TEMPLE_REMOVALS_FLOOR,
  TEMPLE_REMOVALS_ONE_IN,
  TEMPLE_REPORT_REFUSAL,
} from './constants.ts';
import { linesOf, liveEntryOf, monkLinesOf } from './ledger.ts';
import type { LessonId, Ulid } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { ScriptureOperation } from '../schema/temple/operation.ts';
import type { ScriptureFile } from './ledger.ts';

export interface TempleReportRefusal {
  readonly code: typeof TEMPLE_REPORT_REFUSAL;
  /** Which rule: too many new lines, or too many taken out of `owner`'s file. */
  readonly rule: 'adds' | 'removals';
  readonly owner?: string;
}

/** The file whose Monk's line carries `id`: where taking it out takes it from. */
const holderOf = (files: readonly ScriptureFile[], id: LessonId): ScriptureFile | undefined =>
  files.find((file) =>
    linesOf(file).some((line) => line.id === id && liveEntryOf(line, file.ledger)?.source === 'monk'),
  );

/** The ids each file would lose, once each. */
function removalsOf(operations: readonly ScriptureOperation[], files: readonly ScriptureFile[]) {
  const ids = new Set(
    operations.flatMap((operation) => {
      if (operation.op === 'retire') return [operation.lesson];
      return operation.op === 'merge' ? operation.lessons : [];
    }),
  );
  const counts = new Map<ScriptureFile, number>();
  for (const id of ids) {
    const holder = holderOf(files, id);
    if (holder !== undefined) counts.set(holder, (counts.get(holder) ?? 0) + 1);
  }
  return counts;
}

/** The report refused whole when it would replace a scripture instead of editing lines (DB7); else ok. */
export function templeReportIssues(
  operations: readonly ScriptureOperation[],
  files: readonly ScriptureFile[],
): Result<null, TempleReportRefusal> {
  const adds = operations.filter(({ op }) => op !== 'retire').length;
  if (adds > TEMPLE_ADDS_MAX) return err({ code: TEMPLE_REPORT_REFUSAL, rule: 'adds' });
  for (const [file, count] of removalsOf(operations, files)) {
    const allowed = Math.max(
      TEMPLE_REMOVALS_FLOOR,
      Math.floor(monkLinesOf(file).length / TEMPLE_REMOVALS_ONE_IN),
    );
    if (count > allowed) return err({ code: TEMPLE_REPORT_REFUSAL, rule: 'removals', owner: file.owner });
  }
  return ok(null);
}

/** What the Steward hashes for the id of the new line of the operation at `index` (from 0) of report `command`. */
export const templeLessonKeyOf = (command: Ulid, index: number): string =>
  [command, 'temple_report', String(index)].join('\n');

/** `L_<day of the report>_<6 base32 of digest>`: the day the report was written, so it is the same on every reading. */
export function lessonIdOf(reportTs: string, digest: Uint8Array): LessonId {
  // A DateTime of the contract starts with its local date, `yyyy-mm-dd`.
  const day = reportTs.slice(0, '0000-00-00'.length).replaceAll('-', '');
  // formatDatedId with the `L` prefix produces exactly LESSON_ID_PATTERN.
  return formatDatedId('L', day, digest) as LessonId;
}
