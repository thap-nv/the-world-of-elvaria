// The memos of a handover letter (PS-02, implementation-plan §3.16.2, ADR 0024): when an assignee's run ends through a
// submit, a question or a crash, the Steward reads the Memos section with runner-core's memosOf, files each memo as
// memos/<id>.json and routes it by registry/memos.json (the domain's memoOf). The id comes from the quest, the kind
// and the normalized text, so reading the letter again files nothing twice; a memo written again in other words is a
// second memo, for the Chancellor's triage to merge (PS-03b). A memo changes no quest, and nothing about a memo
// stops the run's end: a line that follows no memo, an unknown kind, a file that cannot be written are warnings.
// (PS-22) An objection contests the verdict the run came back with: the domain routes it to a second judge or to the
// owner (contestRoute), and the quest's pending objection goes on the quest with the move that ends the run, so its
// next review answers it (objectionOf). (PS-22b) An amendment goes to the quest's author or to the owner by who wrote
// the quest (authoringOf, authorRoute); the run that filed one ends on it, and the quest waits as on a question.
import { createHash } from 'node:crypto';

import { amendmentDeciderOf, memoIdOf, memoKeyOf, memoOf, objectionOf } from '@elvaria/domain';
import type { Authoring, Contest, Memo, MemoDraft, MemoId, Quest } from '@elvaria/domain';
import { memosOf } from '@elvaria/runner-core';

import { readHandover } from '../files.ts';
import { STEWARD } from '../record.ts';
import { authoringOf } from './authoring.ts';
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
  facts: {
    readonly quest: Quest | undefined;
    readonly contest: Contest;
    readonly authoring: Authoring | undefined;
  },
): Promise<Memo | undefined> {
  const { quest, contest, authoring } = facts;
  const key = memoKeyOf(running.quest, draft);
  const id = memoIdOf(running.quest, digestOf(key));
  if (await alreadyFiled(ctx, running, id, key)) return undefined;
  const source = { quest: running.quest, attempt: running.n, from: running.character };
  const at = ctx.record.stamp();
  const made = memoOf(
    { id, draft, source, at, contest, ...(authoring === undefined ? {} : { authoring }) },
    ctx.world.registry,
  );
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

export interface FiledMemos {
  readonly before: MemoFields;
  /** (PS-22b) The amendment the run ends on: open, of this run, its quest's author's or the owner's to decide. */
  readonly amendment?: Memo;
}

const NOTHING: FiledMemos = { before: {} };

/** The open amendment of run `n`, filed now or at an earlier reading whose move was lost. */
const amendmentOf = (memos: readonly Memo[], n: number): Memo | undefined =>
  memos.find(
    (memo) => memo.attempt === n && memo.state === 'open' && amendmentDeciderOf(memo.to) !== undefined,
  );

/**
 * Files the memos of the letter the assignee of `running` left; any failure is a warning, never the run's end. Gives
 * the quest's pending objection when the letter holds one, and (PS-22b) the amendment the run ends on, each filed now
 * or at an earlier reading whose move was lost.
 */
export async function fileMemos(ctx: Context, running: Running): Promise<FiledMemos> {
  try {
    const letter = await readHandover(ctx.root, running.quest);
    if (letter === null) return NOTHING;
    const { memos, malformed } = memosOf(letter);
    for (const line of malformed)
      warn(ctx, running, `a line of the Memos section follows no memo and is left out: ${line}`);
    const quest = ctx.world.quests.get(running.quest);
    if (memos.length === 0) return NOTHING;
    const contest = await contestOf(ctx, running.quest, running.n);
    const author = quest === undefined ? undefined : authoringOf(ctx, quest);
    let filed: readonly Memo[] = contest.memos;
    for (const draft of memos) {
      const facts = {
        quest,
        contest: { ...contest, memos: filed },
        authoring: author === undefined ? undefined : { ...author, memos: filed },
      };
      const memo = await fileOne(ctx, running, draft, facts);
      if (memo !== undefined) filed = [...filed, memo];
    }
    const objection = objectionOf({ ...contest, memos: filed });
    const before = objection === undefined || objection.memo === quest?.objection?.memo ? {} : { objection };
    const amendment = amendmentOf(filed, running.n);
    return amendment === undefined ? { before } : { before, amendment };
  } catch (error) {
    warn(
      ctx,
      running,
      `the memos of the letter were not filed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return NOTHING;
  }
}
