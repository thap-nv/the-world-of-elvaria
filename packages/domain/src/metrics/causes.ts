// Why a session had to be run again (implementation-plan §3.16.1, ADR 0027): data, not code, so the owner and the
// Monk read one table and a new outcome, trip or fail kind is one more row (ADR 0016). The three causes of the plan
// are `infra` (the kingdom's machinery stopped the work), `output` (the work was wrong) and `question` (the
// assignee asked and went on after the answer); `unknown` is what the files cannot tell, kept apart so that a gap in
// the data never passes for one of the three.
import type { InboxCommandKind } from '../schema/command/inbox-command.ts';
import type { FailKind } from '../schema/common.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { InfirmaryTrip } from '../quest/events.ts';

export const REWORK_CAUSES = ['infra', 'output', 'question', 'unknown'] as const;
export type ReworkCause = (typeof REWORK_CAUSES)[number];

export type AttemptOutcome = NonNullable<Attempt['outcome']>;

/**
 * What the end of one session says about the session that followed it. `submitted` is absent: a handed-in session
 * is judged by its run's verdict. `paused` is absent too: a session the mana stopped is not counted at all, the
 * same attempt goes on after the reset. Known limits, printed with the report: `crash` of a judge is a dead CLI or
 * an invalid verdict alike, and `cancelled` is a release at restart or the owner's cancel alike.
 */
export const OUTCOME_CAUSES: Readonly<Partial<Record<AttemptOutcome, ReworkCause>>> = {
  blocked: 'question',
  breaker: 'infra',
  timeout: 'infra',
  crash: 'infra',
  partial: 'infra',
  cancelled: 'infra',
  // The owner suspended the assignee mid-run: the work was not judged wrong.
  returned: 'infra',
};

/**
 * A fail verdict on the run, by its kind. A check that went red on files Elvaria itself wrote still shows as
 * `output` (known limit): the verdict does not say whose file failed. `flaky` is the check's fault, not the work's.
 */
export const FAIL_KIND_CAUSES: Readonly<Record<FailKind, ReworkCause>> = {
  tests_fail: 'output',
  scope_creep: 'output',
  missing_i18n: 'output',
  wrong_facts: 'output',
  incomplete: 'output',
  style: 'output',
  unsafe: 'output',
  other: 'output',
  flaky: 'infra',
};

/**
 * An infirmary trip between a handed-in session and the next run (a refused commit, forbidden paths, a stalled
 * review). `max_attempts` is absent: it says only that the budget ran out, and the fail or crash before it already
 * gave the cause. Script trips never meet a counted session; they are here so the table is whole.
 */
export const TRIP_CAUSES: Readonly<Partial<Record<InfirmaryTrip, ReworkCause>>> = {
  time: 'infra',
  tokens: 'infra',
  turns: 'infra',
  commit: 'infra',
  secrets: 'infra',
  forbidden_paths: 'infra',
  no_verdict: 'infra',
  partial_verdicts: 'infra',
  script_broken: 'infra',
  script_usage: 'infra',
  script_fail: 'infra',
};

/**
 * Inbox commands that mean the owner had to step into a quest's run (§3.16.1 "số lần cần chủ nhân"). Creating,
 * confirming, sealing and archiving a quest are the owner's normal part, so they are not counted; nor are commands
 * on characters, which name no quest.
 */
export const OWNER_COMMAND_KINDS = [
  'return',
  'retry',
  'reassign',
  'edit_quest',
  'set_rank',
  'answer',
  'cancel',
] as const satisfies readonly InboxCommandKind[];
export type OwnerCommandKind = (typeof OWNER_COMMAND_KINDS)[number];
