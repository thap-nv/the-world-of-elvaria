// The memos of a handover letter (PS-02, implementation-plan §3.16.2, ADR 0024): when an assignee's run ends through a
// submit, a question or a crash, the Steward reads the Memos section with runner-core's memosOf, files each memo as
// memos/<id>.json and routes it by registry/memos.json (the domain's memoOf). The id comes from the quest, the kind
// and the normalized text, so reading the letter again files nothing twice; a memo written again in other words is a
// second memo, for the Chancellor's triage to merge (PS-03b). A memo changes no quest, and nothing about a memo
// stops the run's end: a line that follows no memo, an unknown kind, a file that cannot be written are warnings.
// (PS-22) An objection contests the verdict the run came back with: the domain routes it to a second judge or to the
// owner (contestRoute), and the quest's pending objection goes on the quest with the move that ends the run, so its
// next review answers it (objectionOf).
import { createHash } from 'node:crypto';

import { memoIdOf, memoKeyOf, memoOf, objectionOf } from '@elvaria/domain';
import type { Contest, Memo, MemoDraft, MemoId, Quest } from '@elvaria/domain';
import { memosOf } from '@elvaria/runner-core';

import { readHandover } from '../files.ts';
import { STEWARD } from '../record.ts';
import { contestOf } from './objection.ts';
import type { Context } from '../context.ts';
import type { Running } from '../sessions/running.ts';

/** The same hash the Steward makes quest ids from commands with (questIdOfCommand). */
const digestOf = (key: string): Uint8Array => createHash('sha256').update(key).digest();

const warn = (ctx: Context, running: Running, message: string): void => {
  ctx.deps.log.warn(`steward: ${running.quest}: ${message}`);
};

/** True when `id` holds a memo already: this one from an earlier reading, or (warned) another with the same id. */
async function alreadyFiled(ctx: Context, running: Running, id: MemoId, key: string): Promise<boolean> {
  const read = await ctx.deps.store.memos.read(id);
  if (!read.ok) {
    if (read.error.code === 'not_found') return false;
    warn(ctx, running, `memos/${id}.json cannot be read (${read.error.code}); the memo is not filed again`);
    return true;
  }
  if (memoKeyOf(read.value.quest, read.value) !== key)
    warn(ctx, running, `memos/${id}.json holds another memo with the same id; this one is left out`);
  return true;
}

/** The memo filed, or undefined when it was filed before, is refused or cannot be written (each warned). */
async function fileOne(
  ctx: Context,
  running: Running,
  draft: MemoDraft,
  { quest, contest }: { readonly quest: Quest | undefined; readonly contest: Contest },
): Promise<Memo | undefined> {
  const key = memoKeyOf(running.quest, draft);
  const id = memoIdOf(running.quest, digestOf(key));
  if (await alreadyFiled(ctx, running, id, key)) return undefined;
  const source = { quest: running.quest, attempt: running.n, from: running.character };
  const made = memoOf({ id, draft, source, at: ctx.record.stamp(), contest }, ctx.world.registry);
  if (!made.ok) {
    const why = made.error.code === 'unknown_kind' ? `no memo kind "${made.error.kind}"` : made.error.message;
    warn(ctx, running, `a memo of ${running.character} is left out: ${why}`);
    return undefined;
  }
  const written = await ctx.deps.store.memos.write(made.value);
  if (!written.ok) {
    warn(ctx, running, `memos/${id}.json was not written: ${written.error.message}`);
    return undefined;
  }
  const memo = written.value;
  const where = quest === undefined ? {} : { quest };
  const writer = { kind: 'character', id: memo.from } as const;
  await ctx.record.note({
    type: 'memo.filed',
    actor: writer,
    data: { memo: memo.id, kind: memo.kind, from: memo.from },
    ...where,
  });
  await ctx.record.note({
    type: 'memo.routed',
    actor: STEWARD,
    data: {
      memo: memo.id,
      route: memo.to.route,
      ...(memo.to.refusal === undefined ? {} : { refusal: memo.to.refusal }),
    },
    ...where,
  });
  return memo;
}

/** What the move that ends the run sets on the quest: its pending objection, when one waits for a judge (PS-22). */
export type MemoFields = Partial<Pick<Quest, 'objection'>>;

/**
 * Files the memos of the letter the assignee of `running` left; any failure is a warning, never the run's end. Gives
 * the quest's pending objection when the letter holds one, filed now or at an earlier reading whose move was lost.
 */
export async function fileMemos(ctx: Context, running: Running): Promise<MemoFields> {
  try {
    const letter = await readHandover(ctx.root, running.quest);
    if (letter === null) return {};
    const { memos, malformed } = memosOf(letter);
    for (const line of malformed)
      warn(ctx, running, `a line of the Memos section follows no memo and is left out: ${line}`);
    const quest = ctx.world.quests.get(running.quest);
    if (memos.length === 0) return {};
    const contest = await contestOf(ctx, running.quest, running.n);
    let filed = contest.memos;
    for (const draft of memos) {
      const memo = await fileOne(ctx, running, draft, { quest, contest: { ...contest, memos: filed } });
      if (memo !== undefined) filed = [...filed, memo];
    }
    const objection = objectionOf({ ...contest, memos: filed });
    return objection === undefined || objection.memo === quest?.objection?.memo ? {} : { objection };
  } catch (error) {
    warn(
      ctx,
      running,
      `the memos of the letter were not filed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {};
  }
}
