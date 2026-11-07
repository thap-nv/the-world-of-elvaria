// The verdict files the Steward writes for others (implementation-plan §2.3): a judge's structured output, and the
// owner's seal or return (`verifier_id: user`, P1-04). The verdict schema decides what a file may say; the ids keep
// every judgement of a run in a file of its own (`-p<k>` for a partial, `-user` for the owner's).
import {
  USER_VERIFIER,
  VerdictSchema,
  currentRun,
  err,
  ok,
  ownerVerdictIdOf,
  partialVerdictIdOf,
  verdictIdOf,
  verifierSessionsOf,
} from '@elvaria/domain';
import type { FailKind, Quest, Result, RitualId, Verdict, VerdictCheck } from '@elvaria/domain';

import type { Context } from '../context.ts';

/** What the verifier's structured output says, as far as a verdict file takes it. */
interface VerdictOutput {
  readonly result?: unknown;
  readonly fail_kind?: unknown;
  readonly notes?: unknown;
  readonly progress?: unknown;
}

export interface JudgeRun {
  readonly n: number;
  readonly verifier: string;
  readonly session_id: string;
  /** The machine checks that ran before the session (§3.2). */
  readonly checks: readonly VerdictCheck[];
  /** The ritual of the quest's kind. */
  readonly ritual: RitualId;
}

const parsed = (fields: Record<string, unknown>): Result<Verdict, string> => {
  const verdict = VerdictSchema.safeParse(fields);
  return verdict.success ? ok(verdict.data) : err('invalid_verdict');
};

/** The verdict file of a verifier's session, or why its output is not one. */
export function judgeVerdictOf(
  ctx: Context,
  quest: Quest,
  run: JudgeRun,
  output: unknown,
): Result<Verdict, string> {
  if (typeof output !== 'object' || output === null) return err('no_verdict');
  const { result, fail_kind: failKind, notes, progress } = output as VerdictOutput;
  // A partial verdict and the run's final one used to share `<quest>-<n>` (P1-03): the partial now has its own.
  const id =
    result === 'partial'
      ? partialVerdictIdOf(quest, run.n, verifierSessionsOf(quest, run.n))
      : verdictIdOf(quest, run.n);
  return parsed({
    version: 1,
    id,
    quest_id: quest.id,
    attempt: run.n,
    verifier_id: run.verifier,
    ritual: run.ritual,
    checks: run.checks,
    result,
    ...(failKind === undefined ? {} : { fail_kind: failKind }),
    ...(notes === undefined ? {} : { notes }),
    ...(progress === undefined ? {} : { progress }),
    by_human: false,
    session_id: run.session_id,
    created_at: ctx.record.stamp(),
  });
}

/** The owner's word on the run that waits for the seal: a pass (seal) or a fail (return). */
export type OwnerWord =
  | { readonly result: 'pass'; readonly notes?: string | undefined }
  | { readonly result: 'fail'; readonly notes: string; readonly fail_kind: FailKind };

/** `verdicts/<quest>-<n>-user.json`: the owner's verdict beside the judge's, weighed three times (§2.6). */
export function ownerVerdictOf(
  ctx: Context,
  quest: Quest,
  ritual: RitualId,
  word: OwnerWord,
): Result<Verdict, string> {
  const n = currentRun(quest);
  const { notes, ...said } = word;
  return parsed({
    version: 1,
    id: ownerVerdictIdOf(quest, n),
    quest_id: quest.id,
    attempt: n,
    verifier_id: USER_VERIFIER,
    ritual,
    checks: [],
    ...said,
    ...(notes === undefined ? {} : { notes }),
    by_human: true,
    created_at: ctx.record.stamp(),
  });
}
