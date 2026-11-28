// What ready work waits for (LL-03, plans/learning-loop.md §4.1): each tick the Steward reads the waits off planTick's
// snapshot and plan (tickWaitsOf) and writes them by their edges, as `quest.unclaimable`: `wait.started` once a wait
// lasted WAIT_MIN_MINUTES, `wait.ended` with its minutes once it is gone, so work queuing as it should writes nothing.
// The book lives in memory, as the notices do since `.state/unclaimable.json` went (P2-04): the waits with a line are
// the log's (openWaitsOf), rebuilt at start, and the first tick ends at the start's time those that no longer hold; a
// wait seen and not written yet is seen again. No bell rings and nothing the plan decides changes.
import { openWaitsOf, tickWaitsOf, waitStepOf } from '@elvaria/domain';
import type {
  Event,
  Instant,
  KingdomSnapshot,
  OpenWait,
  SeenWait,
  TickPlan,
  Wait,
  WaitBook,
  WaitEnd,
  ZonedTime,
} from '@elvaria/domain';

import { STEWARD } from '../quest/record.ts';
import type { Context } from '../context.ts';
import type { Line } from '../quest/record.ts';

export interface WaitState {
  book: WaitBook;
  /** The start of this Steward, for its first tick only: a wait the last one left open that is gone ended by then. */
  endAt: Instant | undefined;
}

export const createWaitState = (): WaitState => ({ book: { seen: [], open: [] }, endAt: undefined });

/** The waits the last Steward left open, as the log says them; `startedAt`: this Steward's `steward.started`. */
export function recoverWaits(state: WaitState, events: readonly Event[], startedAt: Instant): void {
  state.book = { seen: [], open: openWaitsOf(events) };
  state.endAt = startedAt;
}

/** What a tick's waits are read from: planTick's snapshot and plan at `now`; the kingdom's zone writes `since`. */
export interface WaitTick {
  readonly snapshot: KingdomSnapshot;
  readonly plan: TickPlan;
  readonly now: Instant;
  readonly zone: ZonedTime;
}

/** Where a wait's line goes: its quest's (the journal too), or its territory's for a guest entry. */
function placeOf(ctx: Context, wait: Wait): Pick<Line, 'quest' | 'territory'> {
  const quest = wait.quest === undefined ? undefined : ctx.world.quests.get(wait.quest);
  return quest === undefined ? { territory: wait.territory } : { quest };
}

const prOf = ({ pr }: Wait) => (pr === undefined ? {} : { pr });

async function start(ctx: Context, { wait, since }: SeenWait, zone: ZonedTime): Promise<OpenWait> {
  const data = { reason: wait.reason, since: zone.format(since), ...prOf(wait), holder: wait.holder };
  const line = await ctx.record.note({ type: 'wait.started', actor: STEWARD, data, ...placeOf(ctx, wait) });
  return { wait, since, started: line.id };
}

async function end(ctx: Context, { open, minutes }: WaitEnd): Promise<void> {
  const data = { started: open.started, reason: open.wait.reason, minutes, ...prOf(open.wait) };
  await ctx.record.note({ type: 'wait.ended', actor: STEWARD, data, ...placeOf(ctx, open.wait) });
}

/**
 * Ends the waits gone since the last tick and starts those seen long enough. The book follows each line, so a line
 * that fails leaves it as the log is.
 */
export async function noteWaits(ctx: Context, state: WaitState, tick: WaitTick): Promise<void> {
  const { snapshot, plan, now, zone } = tick;
  const step = waitStepOf(state.book, tickWaitsOf(snapshot, plan, now), now, state.endAt ?? now);
  for (const gone of step.end) {
    await end(ctx, gone);
    const open = state.book.open.filter(({ started }) => started !== gone.open.started);
    state.book = { ...state.book, open };
  }
  for (const seen of step.start) {
    const open = [...state.book.open, await start(ctx, seen, zone)];
    state.book = { ...state.book, open };
  }
  state.book = { ...state.book, seen: step.seen };
  state.endAt = undefined;
}
