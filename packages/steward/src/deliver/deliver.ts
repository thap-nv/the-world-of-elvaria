// Step 7 of a tick (implementation-plan §3.1, §2.5 `done.deliver`, P1-14): each done quest planTick lists is
// delivered once, by the convention of its kind (`deliverable.type`, copied from kinds[kind].deliverable_type when
// the quest was made; data, not a switch over kinds, ADR 0016). Work on a git territory is already on its branch:
// the owner merges it by hand after reading the note (§9.1 item 11); a plot folder of a territory without git is
// copied into the territory (ADR 0012); a draft stays a draft, sent by nobody but the owner, and reached `done`
// through the seal its kind asks for; a plan's sub-quests open. Every delivery writes `.runs/<quest>-delivery.md`
// and then stamps `deliverable.delivered_at` (with `path`, and `branch` for a worktree), so a crash in between
// delivers again, finding what it already did.
import { currentRun, err, ok, ownerVerdictIdOf, verdictIdOf } from '@elvaria/domain';
import { fromPortable, inKingdom, writeFileAtomic } from '@elvaria/store';
import type { Deliverable, Quest, QuestId, Result, Territory, Verdict } from '@elvaria/domain';

import { noticeQuest, ring } from '../context.ts';
import { readHandover } from '../files.ts';
import { copyIntoTerritory } from './copy.ts';
import { deliveryNote, deliveryNoteOf } from './note.ts';
import { openSubquests } from './subquests.ts';
import type { Context } from '../context.ts';
import type { Copied } from './copy.ts';
import type { Subquests } from './subquests.ts';

interface Shipped {
  readonly copied?: Copied;
  readonly subquests?: Subquests;
}

type Ship = (
  ctx: Context,
  quest: Quest,
  territory: Territory | undefined,
) => Promise<Result<Shipped, string>>;

const shipped = (value: Shipped): Result<Shipped, string> => ok(value);

/** The plot's folder, native: a worktree's own path, or the folder inside the kingdom. */
function plotDirOf(ctx: Context, plot: Quest['plot']): string | undefined {
  if (plot.path === undefined || plot.type === 'none') return undefined;
  return plot.type === 'worktree' ? fromPortable(plot.path) : inKingdom(ctx.root, plot.path);
}

/** The work itself: on its branch already, or in a plot folder to copy into the territory. */
const work: Ship = async (ctx, quest, territory) => {
  const plot = quest.plot;
  if (plot.type !== 'folder' || plot.path === undefined || territory === undefined) return shipped({});
  return shipped({ copied: await copyIntoTerritory(ctx.root, quest.id, plot.path, territory.path) });
};

const subquests: Ship = async (ctx, quest) => {
  const opened = await openSubquests(ctx, quest, plotDirOf(ctx, quest.plot));
  return opened.ok ? shipped({ subquests: opened.value }) : opened;
};

/** What each deliverable type does before the note. */
const SHIP: Readonly<Record<Deliverable['type'], Ship>> = {
  branch: work,
  file: work,
  report: work,
  draft: work,
  subquests,
  none: () => Promise.resolve(shipped({})),
};

/** The verdicts of the run that made the quest done: the judge's or the machine's, then the owner's. */
async function verdictsOf(ctx: Context, quest: Quest): Promise<Verdict[]> {
  const n = currentRun(quest);
  const read = await Promise.all(
    [verdictIdOf(quest, n), ownerVerdictIdOf(quest, n)].map((id) => ctx.deps.store.verdicts.read(id)),
  );
  return read.flatMap((verdict) => (verdict.ok ? [verdict.value] : []));
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function deliverQuest(ctx: Context, quest: Quest): Promise<Result<Quest, string>> {
  const territory = ctx.world.territories.get(quest.territory);
  const done = await SHIP[quest.deliverable.type](ctx, quest, territory);
  if (!done.ok) return done;
  const note = deliveryNoteOf(quest);
  const text = deliveryNote({
    quest,
    territory,
    handover: await readHandover(ctx.root, quest.id),
    verdicts: await verdictsOf(ctx, quest),
    ...done.value,
  });
  await writeFileAtomic(inKingdom(ctx.root, note), text);
  const branch = quest.plot.type === 'worktree' ? quest.plot.branch : undefined;
  const deliverable = { ...quest.deliverable, path: note, ...(branch === undefined ? {} : { branch }) };
  const moved = await ctx.record.move({
    quest: quest.id,
    event: { type: 'deliver' },
    actor: 'steward',
    before: { deliverable },
  });
  if (moved.ok && done.value.subquests?.status === 'refused')
    await refusedPlan(ctx, moved.value, done.value.subquests.reason);
  return moved;
}

/** A plan that opened nothing is delivered all the same; the owner hears it once, when it is (P1-14, §11). */
async function refusedPlan(ctx: Context, quest: Quest, reason: string): Promise<void> {
  ctx.deps.log.warn(`steward: ${quest.id}: delivered, no sub-quest opened: ${reason}`);
  await ring(ctx, { kind: 'subquests_refused', quest: noticeQuest(quest), reason });
}

/** One delivery; a file that cannot be read or written leaves the quest for the next tick. */
export async function deliver(ctx: Context, id: QuestId): Promise<Result<Quest, string>> {
  const quest = ctx.world.quests.get(id);
  if (quest === undefined) return err('unknown_quest');
  try {
    return await deliverQuest(ctx, quest);
  } catch (error) {
    return err(messageOf(error));
  }
}
