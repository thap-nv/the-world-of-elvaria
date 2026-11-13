// What an assignee that goes on with a quest in a fresh session reads instead of a transcript (implementation-plan
// §10 question 4, ADR 0017): why it goes on (a return with its verdict, or a revival), the letter, the journal, what
// the branch touched, why the Steward refused the last run's patch when it did (P1-31), and the memos its letters
// filed (PS-02).
import { currentRun, isEventOf, ownerVerdictIdOf, verdictIdOf } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import type { Quest, Verdict } from '@elvaria/domain';
import type { Continuation, Memory } from '@elvaria/runner-core';

import { readHandover, readJournal } from '../files.ts';
import { refusedPatchOf } from '../infirmary.ts';
import { filedMemosOf } from '../memos/filed.ts';
import { withLogTails } from '../review/log-tail.ts';
import type { Context } from '../context.ts';
import type { SessionInput } from './input.ts';

/**
 * What a continuing session reads instead of a transcript (ADR 0017), with the memos its letters filed (PS-02); the
 * branch's git log comes with P1-07.
 */
async function memoryOf(ctx: Context, quest: Quest): Promise<Memory> {
  return {
    handover: await readHandover(ctx.root, quest.id),
    journal: await readJournal(ctx.root, quest.id),
    git_log: null,
    memos: await filedMemosOf(ctx, quest.id),
  };
}

/**
 * Why the Steward refused the patch of run `n` (P1-31), from that run's `quest.infirmary` line in the quest's journal:
 * the quest file keeps no reason. A run ends once, so one line at most says so; a later infirmary of the same run
 * (its secrets gone at the next claim) says something else. A journal that cannot be read tells nothing.
 */
async function refusedPatchOfRun(ctx: Context, quest: Quest, n: number): Promise<string | undefined> {
  try {
    const { events } = await openJournal(ctx.root, quest.id).read();
    for (const event of events) {
      if (!isEventOf(event, 'quest.infirmary') || event.attempt !== n) continue;
      const why = refusedPatchOf(event.data);
      if (why !== undefined) return why;
    }
  } catch {
    // Nothing to tell: the session reads its letter and journal as after any revival.
  }
  return undefined;
}

/** The verdict a second judge's fail answered the objection against (PS-22): the session reads both notes. */
async function contestedOf(ctx: Context, verdict: Verdict): Promise<{ contested?: Verdict }> {
  if (verdict.objection === undefined) return {};
  const contested = await ctx.deps.store.verdicts.read(verdict.objection.verdict);
  return contested.ok ? { contested: contested.value } : {};
}

/**
 * The verdict a returned quest comes back with: the owner's return (`<quest>-<n>-user`), else the judge's or the
 * machine's fail (`<quest>-<n>`) on the last run; a crash returns with none. Either says why the last run's patch
 * was refused, when it was (P1-31), and a second judge's fail the verdict the objection contested (PS-22).
 */
export async function continuationOf(ctx: Context, quest: Quest): Promise<Continuation> {
  const n = currentRun(quest);
  const why = await refusedPatchOfRun(ctx, quest, n);
  const refused = why === undefined ? {} : { refused_patch: why };
  for (const id of [ownerVerdictIdOf(quest, n), verdictIdOf(quest, n)]) {
    const verdict = await ctx.deps.store.verdicts.read(id);
    if (verdict.ok && verdict.value.result === 'fail')
      return {
        reason: 'returned',
        verdict: verdict.value,
        ...(await contestedOf(ctx, verdict.value)),
        ...refused,
      };
  }
  return { reason: 'revive', ...refused };
}

/**
 * What the branch touched as the session opens, by which the prompt names the checks the machine will run on the work
 * (P1-43, (d) of P1-37). A plot that cannot be read gives nothing: the session opens without that section.
 */
async function touchedOf(ctx: Context, quest: Quest): Promise<Pick<Continuation, 'touched'>> {
  try {
    return { touched: await ctx.deps.plots.touched(quest.plot) };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    ctx.deps.log.warn(`steward: ${quest.id}: what the branch touched is unknown: ${why}`);
    return {};
  }
}

/**
 * What a continuing assignee reads: the letter, the journal, the checks ahead of its work and, after a return, the
 * checks of the verdict with the end of each failing one's log, masked with `known`: the assignee cannot read `.runs/`
 * either (P1-10b).
 */
export async function continuationFor(
  ctx: Context,
  input: SessionInput,
  known: readonly string[],
): Promise<(Continuation & Memory) | null> {
  const { continuation, quest } = input;
  if (continuation === undefined || continuation === null) return null;
  const memory = { ...(await memoryOf(ctx, quest)), ...(await touchedOf(ctx, quest)) };
  if (continuation.reason === 'revive') return { ...continuation, ...memory };
  const checks = await withLogTails(ctx.root, continuation.verdict.checks, known);
  return { ...continuation, ...memory, checks };
}
