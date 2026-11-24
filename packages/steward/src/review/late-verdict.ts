// The late machine verdict, as the Steward writes it (CM-06, ADR 0033, plans/check-modes.md "Lần trượt muộn"): a check
// that first ran after a run's pass, at the merge queue or the patrol of the base branch, turned red through the
// quest's own change. One file `<quest>-<n>-late` beside the pass it overturns, its `verdict.fail` line, and who shares
// the fail: the judge whose pass it was (overturnedJudgeOf). The queue and the patrol both write it here; what follows
// differs (a move of the done quest, or the windows of an archived one). Written once: a Steward that writes it again
// after a stop finds the file and leaves it as it was. Each red check carries the first line of its log that says why
// it failed, masked with every value of the treasury, as the queue's tails are (CM-05 proposal (a)).
import {
  currentRun,
  err,
  lateVerdictIdOf,
  lateVerdictOf,
  ok,
  overturnedJudgeOf,
  verdictIdOf,
  withOverturnedPass,
} from '@elvaria/domain';
import { createRedactor } from '@elvaria/eventlog';
import { failureInLogFile } from '@elvaria/runner-core';
import type { CharacterId, LateCheck, Quest, Result, Verdict, VerdictCheck } from '@elvaria/domain';

import { recordVerdict, ritualOf } from './verdicts.ts';
import { STEWARD } from '../quest/record.ts';
import type { Context } from '../context.ts';
import type { CharacterEdit } from '../quest/record.ts';

export interface LateVerdict {
  /** The late verdict, as written now or found from before. */
  readonly verdict: Verdict & { readonly result: 'fail' };
  /** The judge whose pass of the run it overturns; undefined for the machine's or the owner's pass, or none. */
  readonly judge: CharacterId | undefined;
}

/** Each red check with the first line of its log that says why, masked; a log that says nothing leaves it bare. */
async function lateChecksOf(ctx: Context, red: readonly VerdictCheck[]): Promise<LateCheck[]> {
  const known = Object.values(await ctx.deps.treasury.resolve(await ctx.deps.treasury.names()));
  const mask = createRedactor(known);
  return Promise.all(
    red.map(async (check) => {
      const { line } = await failureInLogFile(ctx.root, check.log_path);
      return line === undefined ? { check } : { check, error_line: mask(line) };
    }),
  );
}

/** The run's pass, when its file reads: the judge it names shares the fail. */
async function judgeOf(ctx: Context, quest: Quest, n: number): Promise<CharacterId | undefined> {
  const pass = await ctx.deps.store.verdicts.read(verdictIdOf(quest, n));
  return pass.ok ? overturnedJudgeOf(pass.value) : undefined;
}

/**
 * The late verdict of the quest's current run for the `red` checks (each `pass: false`), written unless its file is
 * there already; an error when the quest's ritual is unknown, the checks make no verdict or the store refuses it.
 */
export async function writeLateVerdict(
  ctx: Context,
  quest: Quest,
  red: readonly VerdictCheck[],
): Promise<Result<LateVerdict, string>> {
  const n = currentRun(quest);
  const judge = await judgeOf(ctx, quest, n);
  const found = await ctx.deps.store.verdicts.read(lateVerdictIdOf(quest, n));
  if (found.ok) return ok({ verdict: { ...found.value, result: 'fail' }, judge });
  const ritual = ritualOf(ctx, quest);
  if (ritual === undefined) return err('unknown_ritual');
  const checks = await lateChecksOf(ctx, red);
  const made = lateVerdictOf({ quest, n, ritual: ritual.id, checks, at: ctx.record.stamp() });
  if (!made.ok) return err(made.error.code);
  const written = await recordVerdict(ctx, quest, made.value, STEWARD);
  return written.ok ? ok({ verdict: { ...written.value, result: 'fail' }, judge }) : written;
}

/** The judge's share of a late fail (withOverturnedPass), for a character the kingdom still has. */
export function overturnedEdits(
  ctx: Context,
  quest: Quest,
  late: LateVerdict,
): Readonly<Record<string, CharacterEdit>> {
  const { judge, verdict } = late;
  if (judge === undefined || !ctx.world.characters.has(judge)) return {};
  const edit: CharacterEdit = (character, at) =>
    ok(withOverturnedPass(character, { verdict_id: verdict.id, at, tags: quest.tags }));
  return { [judge]: edit };
}
