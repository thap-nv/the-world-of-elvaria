// The verdict files the Steward writes for others (implementation-plan §2.3): a judge's structured output, and the
// owner's seal or return (`verifier_id: user`, P1-04). The verdict schema decides what a file may say; the ids keep
// every judgement of a run in a file of its own (`-p<k>` for a partial, `-user` for the owner's). A judge of a tribe
// without structured output replies in text: the same check names what its one retry is told (P1-33).
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
import { issueLines } from '@elvaria/runner-core';
import type { Character, FailKind, Quest, Result, RitualId, Verdict, VerdictCheck } from '@elvaria/domain';
import type { ParseOptions } from '@elvaria/runner-core';

import { ritualOf } from '../verdicts.ts';
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

/** Why a verifier's output is no verdict: none at all, or one the verdict schema refuses, issue by issue. */
export interface VerdictRefusal {
  readonly code: 'no_verdict' | 'invalid_verdict';
  /** `path: message`: what a judge of a tribe without structured output is told when it tries again (P1-33). */
  readonly issues: readonly string[];
}

const checked = (fields: Record<string, unknown>): Result<Verdict, readonly string[]> => {
  const verdict = VerdictSchema.safeParse(fields);
  return verdict.success ? ok(verdict.data) : err(issueLines(verdict.error.issues));
};

const parsed = (fields: Record<string, unknown>): Result<Verdict, string> => {
  const verdict = checked(fields);
  return verdict.ok ? verdict : err('invalid_verdict');
};

/** `no_verdict: …` or `invalid_verdict: …`, for the log and the infirmary. */
export const refusalText = ({ code, issues }: VerdictRefusal): string => `${code}: ${issues.join('; ')}`;

/** The verdict file of a verifier's session, or why its output is not one. */
export function judgeVerdictOf(
  ctx: Context,
  quest: Quest,
  run: JudgeRun,
  output: unknown,
): Result<Verdict, VerdictRefusal> {
  if (typeof output !== 'object' || output === null || Array.isArray(output))
    return err({ code: 'no_verdict', issues: ['(reply): not a JSON object'] });
  const { result, fail_kind: failKind, notes, progress } = output as VerdictOutput;
  // A partial verdict and the run's final one used to share `<quest>-<n>` (P1-03): the partial now has its own.
  const id =
    result === 'partial'
      ? partialVerdictIdOf(quest, run.n, verifierSessionsOf(quest, run.n))
      : verdictIdOf(quest, run.n);
  const verdict = checked({
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
  return verdict.ok ? verdict : err({ code: 'invalid_verdict', issues: verdict.error });
}

/**
 * What spawnParsed asks before it tries a judge's text reply again (§3.14, P1-33): the issues judgeVerdictOf finds,
 * none when the reply makes a verdict. Asked when the session ends, so the quest is read then: its verifier entry
 * names the partial verdict's number.
 */
export const verdictIssuesOf =
  (ctx: Context, quest: Quest, run: JudgeRun) =>
  (output: unknown): readonly string[] => {
    const verdict = judgeVerdictOf(ctx, ctx.world.quests.get(quest.id) ?? quest, run, output);
    return verdict.ok ? [] : verdict.error.issues;
  };

/** The session id a check made before the spawn stands in with: the verdict file takes the real one later. */
const NOT_YET = 'not-yet-spawned';

/**
 * How the judge `character` replies when its tribe has no structured output (§3.14 `prompt_and_parse`, P1-33): the
 * check of its text reply, and whether the retry may continue its session. Undefined for a tribe with the flag.
 * Without a ritual the reply cannot be checked: it is not tried again, and the judge's end says why.
 */
export function judgeParseOf(
  ctx: Context,
  quest: Quest,
  character: Pick<Character, 'id' | 'tribe'>,
  run: Pick<JudgeRun, 'n' | 'checks'>,
): ParseOptions | undefined {
  const limits = ctx.limits[character.tribe];
  if (limits?.structured_output !== 'prompt_and_parse') return undefined;
  const ritual = ritualOf(ctx, quest);
  const judged = { ...run, verifier: character.id, session_id: NOT_YET };
  const check =
    ritual === undefined ? () => [] : verdictIssuesOf(ctx, quest, { ...judged, ritual: ritual.id });
  return { check, resume: limits.resume };
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
