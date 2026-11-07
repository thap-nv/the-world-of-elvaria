// The verdict of a script-tier run (implementation-plan §2.5, §3.12, ADR 0017): the machine judges, from the script's
// result alone. The run is one check named after the script; the notes say which, with the log, then the result's
// summary (a check's details, a report's summary, the units still open), so the owner reads the outcome in the
// verdict without opening the run folder.
import { ok } from '../core/result.ts';
import { machineVerdictOf } from '../verify/machine-verdict.ts';
import type { CheckId, RitualId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Verdict } from '../schema/quest/verdict.ts';
import type { CatalogScript } from '../schema/registry-entries.ts';
import type { ScriptResult } from './outcome.ts';

/**
 * The check id of a script: its id in snake case (`link-check` → `link_check`). Script ids are kebab-case because
 * they name files, check ids snake_case like every registry id (§2.1); the scripts' pattern maps onto the checks'.
 */
export const scriptCheckId = (id: CatalogScript['id']): CheckId => id.replaceAll('-', '_') as CheckId;

export interface ScriptReview {
  readonly quest: Pick<Quest, 'id'>;
  /** The run it judges. */
  readonly n: number;
  /** The ritual of the quest's kind. */
  readonly ritual: RitualId;
  readonly script: Pick<CatalogScript, 'id'>;
  readonly result: ScriptResult;
  readonly duration_ms: number;
  /** Where stdout and stderr of the run went, relative to the kingdom: `.runs/<quest>-<n>/script.log`. */
  readonly log_path: string;
  /** ISO 8601 in kingdom.tz. */
  readonly at: string;
}

/** `invalid_verdict` only when the inputs break the verdict schema (a run below 1, a time without offset). */
export function scriptVerdictOf(review: ScriptReview): Result<Verdict, { readonly code: 'invalid_verdict' }> {
  const check = {
    id: scriptCheckId(review.script.id),
    pass: review.result.pass,
    duration_ms: review.duration_ms,
    log_path: review.log_path,
  };
  const { quest, n, ritual, at } = review;
  const made = machineVerdictOf({ quest, n, ritual, checks: [check], at });
  if (!made.ok) return made;
  // machineVerdictOf notes the check (✓ or ✗ with its log); the summary follows it.
  const notes = [made.value.notes, review.result.summary].filter((part) => part !== undefined && part !== '');
  return ok({ ...made.value, notes: notes.join('\n\n') });
}
