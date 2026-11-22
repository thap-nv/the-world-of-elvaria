// The Steward's advisory (PS-09c, implementation-plan §3.16.2, §3.16.7, ADR 0024 amended): as a quest's branch is
// found in its territory's base branch, under every delivery mode (archiveInBase), the Steward reads what the quest
// touched while its plot is still there, and files one memo to the quests at work whose scope meets those files, shared
// paths aside (they are the machine's to merge). Before the archive, with an id made from that quest alone: a Steward
// that stopped in between files it once when it runs again. Each quest it went to reads it once, in the next prompt of
// its assignee (advisoriesOf, then deliverAdvisories once the session opened); the memo closes `delivered` or `lapsed`
// once each read it or left. The decisions are the domain's; a memo never stops an archive or a session.
import { createHash } from 'node:crypto';

import {
  advisoriesFor,
  advisoryBodyOf,
  advisoryKeyOf,
  advisoryKindOf,
  advisoryOf,
  advisoryRefsFor,
  currentRun,
  deliveredTo,
  deliveryEndOf,
  memoIdOf,
  memoOf,
  recipientsOf,
} from '@elvaria/domain';
import type { Memo, MemoDraft, MemoId, Quest, QuestId, Territory } from '@elvaria/domain';
import { ruleOf } from '@elvaria/runner-core';
import type { PromptAdvisory } from '@elvaria/runner-core';

import { STEWARD } from '../quest/record.ts';
import { writeClosed } from './close.ts';
import type { Context } from '../context.ts';

/** The hash memo ids are made with (memoIdOf), as file.ts makes them. */
const digestOf = (key: string): Uint8Array => createHash('sha256').update(key).digest();

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const warn = (ctx: Context, quest: QuestId, message: string): void => {
  ctx.deps.log.warn(`steward: ${quest}: ${message}`);
};

/** The files of `files` a glob of the territory's shared_paths matches: the merge queue's own reading (ruleOf). */
const sharedOf = (files: readonly string[], territory: Territory | undefined): string[] =>
  files.filter((file) => ruleOf(file, territory?.shared_paths ?? []) !== undefined);

/**
 * (PS-09c) The quests at work a character's advisory goes to: those whose scope meets its refs, shared paths aside;
 * none when its quest is unknown.
 */
export function recipientsFor(ctx: Context, quest: Quest | undefined, refs: readonly string[]): QuestId[] {
  if (quest === undefined) return [];
  const shared = sharedOf(refs, ctx.world.territories.get(quest.territory));
  const own = refs.filter((ref) => !shared.includes(ref));
  return recipientsOf(quest, own, [...ctx.world.quests.values()]);
}

/** The commit a reader reads the new files at: the head of the quest's branch, else the branch's name. */
async function commitOf(ctx: Context, quest: Quest): Promise<string> {
  const head = await ctx.deps.plots.head(quest.plot).catch(() => null);
  return head ?? quest.plot.branch ?? quest.id;
}

/** The advisory as a memo file, its two lines in `landed`'s journal; a refusal or a failed write is a warning. */
async function writeAdvisory(
  ctx: Context,
  landed: Quest,
  id: MemoId,
  draft: MemoDraft,
  to: readonly QuestId[],
) {
  const source = { quest: landed.id, attempt: Math.max(1, currentRun(landed)) };
  const made = memoOf({ id, draft, source, at: ctx.record.stamp(), recipients: to }, ctx.world.registry);
  if (!made.ok) {
    warn(ctx, landed.id, `no advisory: ${JSON.stringify(made.error)}`);
    return;
  }
  const written = await ctx.deps.store.memos.write(made.value);
  if (!written.ok) {
    warn(ctx, landed.id, `memos/${id}.json was not written: ${written.error.message}`);
    return;
  }
  const { kind } = draft;
  await ctx.record.note({ type: 'memo.filed', actor: STEWARD, data: { memo: id, kind }, quest: landed });
  await ctx.record.note({
    type: 'memo.routed',
    actor: STEWARD,
    data: { memo: id, route: 'quests' },
    quest: landed,
  });
}

/** Files the advisory of `landed`, unless nobody gets one or it was filed before; every failure is a warning. */
async function fileAdvisory(ctx: Context, landed: Quest): Promise<void> {
  if (landed.plot.type !== 'worktree') return;
  const changed = await ctx.deps.plots.touched(landed.plot);
  const territory = ctx.world.territories.get(landed.territory);
  const advisory = advisoryOf(landed, changed, [...ctx.world.quests.values()], sharedOf(changed, territory));
  if (advisory === undefined) return;
  const kind = advisoryKindOf(ctx.world.registry);
  if (kind === undefined) {
    const to = advisory.quests.join(', ');
    warn(
      ctx,
      landed.id,
      `no advisory to ${to}: registry/memos.json has no kind routed to quests (elvaria upgrade)`,
    );
    return;
  }
  const id = memoIdOf(landed.id, digestOf(advisoryKeyOf(landed.id, kind)));
  const before = await ctx.deps.store.memos.read(id);
  if (before.ok || before.error.code !== 'not_found') return;
  const body = advisoryBodyOf(landed, await commitOf(ctx, landed), advisory.more);
  await writeAdvisory(ctx, landed, id, { kind, body, refs: advisory.refs }, advisory.quests);
}

/** Closes each open memo to quests whose quests all read it or left: `delivered` or `lapsed` (deliveryEndOf). */
async function settleAdvisories(ctx: Context, memos?: readonly Memo[]): Promise<void> {
  const open = memos ?? (await ctx.deps.store.memos.list()).items;
  for (const memo of open) {
    const end = deliveryEndOf(memo, (id) => ctx.world.quests.get(id));
    if (end === undefined) continue;
    const closed = await writeClosed(ctx, memo, { decision: end }, STEWARD);
    if (!closed.ok) warn(ctx, memo.quest, `memo ${memo.id} was not closed ${end}: ${closed.error}`);
  }
}

/**
 * As quest `id` reaches its base branch, before its archive releases the plot: its advisory filed, then the memos to
 * quests that nobody will read any more closed (the quest itself leaves them now). Never refuses the archive.
 */
export async function adviseOnLanding(ctx: Context, id: QuestId): Promise<void> {
  const landed = ctx.world.quests.get(id);
  if (landed === undefined) return;
  try {
    await fileAdvisory(ctx, landed);
    await settleAdvisories(ctx);
  } catch (error) {
    warn(ctx, id, `the advisory was not filed: ${messageOf(error)}`);
  }
}

/** The advisories `quest`'s next assignee session reads, newest first; none when the memos cannot be read. */
export async function advisoriesOf(ctx: Context, quest: Quest): Promise<Memo[]> {
  try {
    return advisoriesFor((await ctx.deps.store.memos.list()).items, quest.id);
  } catch (error) {
    warn(ctx, quest.id, `its advisories cannot be read: ${messageOf(error)}`);
    return [];
  }
}

/** The advisories as the prompt shows them: each with the files `quest`'s scope may hold (advisoryRefsFor). */
export const promptAdvisoriesOf = (memos: readonly Memo[], quest: Quest): PromptAdvisory[] =>
  memos.map((memo) => ({
    id: memo.id,
    quest: memo.quest,
    body: memo.body,
    refs: [...advisoryRefsFor(memo, quest)],
    filed_at: memo.filed_at,
  }));

/** One advisory read by `quest` at run `n`: its delivery in the file, memo.delivered in the quest's journal. */
async function deliverOne(ctx: Context, quest: Quest, n: number, memo: Memo): Promise<Memo | undefined> {
  const read = await ctx.deps.store.memos.read(memo.id);
  if (!read.ok || read.value.state === 'closed') return undefined;
  const delivered = deliveredTo(read.value, { quest: quest.id, attempt: n, at: ctx.record.stamp() });
  if (delivered === read.value) return undefined;
  const written = await ctx.deps.store.memos.write(delivered);
  if (!written.ok) {
    warn(ctx, quest.id, `memos/${memo.id}.json was not written: ${written.error.message}`);
    return undefined;
  }
  await ctx.record.note({ type: 'memo.delivered', actor: STEWARD, data: { memo: memo.id }, quest });
  return written.value;
}

/**
 * Once `quest`'s assignee session opened at run `n` with `memos` in its prompt (the quest moved, so the session runs):
 * each recorded as read, never shown again, and closed when that was the last quest to wait for it. A reading the
 * Steward cannot record is a warning: the session runs, and the next one reads the advisory again.
 */
export async function deliverAdvisories(
  ctx: Context,
  id: QuestId,
  n: number,
  memos: readonly Memo[],
): Promise<void> {
  const quest = ctx.world.quests.get(id);
  if (quest === undefined || memos.length === 0) return;
  try {
    const read: Memo[] = [];
    for (const memo of memos) {
      const delivered = await deliverOne(ctx, quest, n, memo);
      if (delivered !== undefined) read.push(delivered);
    }
    await settleAdvisories(ctx, read);
  } catch (error) {
    warn(ctx, id, `its advisories were not recorded as read: ${messageOf(error)}`);
  }
}
