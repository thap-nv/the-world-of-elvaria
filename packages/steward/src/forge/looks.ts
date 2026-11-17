// The looks at the territories' base branches (implementation-plan §3.16.7, ADR 0023; PS-08d, (E) of the PS-08 plan):
// which done quests' branches are in their base branch, under every delivery mode, so the Steward archives them and
// releases their plot. planTick decides when (baseLooks: at start, right after a merge there, then every
// BASE_LOOK_MINUTES while a quest is there to ask about); a look runs outside the tick, one per territory at a time,
// and fetches the base branch once (a fetch talks to the network). A table of its own, as the code graphs have: the
// Background table keeps one piece of work per quest, and a look serves every done quest of its territory. The tips a
// look saw stay, per territory, for the merge queue that comes next (PS-09). A Steward that stops aborts the look, and
// the next one looks again at start.
import type { BaseLook, Instant, QuestId, TerritoryId } from '@elvaria/domain';
import type { BaseTips } from '@elvaria/runner-core';

import type { Context } from '../context.ts';
import type { Logger } from '../types.ts';

export interface BaseLooks {
  /** Done quests a look found in their base branch, until the Steward archives them. */
  readonly found: Set<QuestId>;
  /** When each territory was last looked at; a merge there forgets it, so the next tick looks at once. */
  readonly looked: Map<TerritoryId, Instant>;
  /** The base branch's tips each territory's last look saw. */
  readonly tips: Map<TerritoryId, BaseTips>;
  /** Starts `look` outside the tick unless one runs on its territory. */
  start(ctx: Context, look: BaseLook): void;
  /** Resolves once no look runs. */
  idle(): Promise<void>;
  /** Aborts the looks and waits for them to end (the Steward stops). */
  stop(): Promise<void>;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The Steward stopped: asked anew after each await, which TypeScript's narrowing cannot see. */
const stopped = (signal: AbortSignal): boolean => signal.aborted;

/** One look: the tips fetched once, then each quest's plot asked; what it finds goes to `found`. */
async function lookAt(ctx: Context, look: BaseLook, signal: AbortSignal): Promise<void> {
  const { plots } = ctx.deps;
  const territory = ctx.world.territories.get(look.territory);
  if (territory === undefined || plots.baseTips === undefined || plots.inBase === undefined) return;
  const tips = await plots.baseTips(territory);
  if (tips === undefined || stopped(signal)) return;
  ctx.looks.tips.set(territory.id, tips);
  for (const id of look.quests) {
    const quest = ctx.world.quests.get(id);
    if (quest !== undefined && (await plots.inBase(quest.plot, tips))) ctx.looks.found.add(id);
    if (stopped(signal)) return;
  }
}

/** `ended` is told when a look ends on its own: the Steward ticks then, to archive what it found (P1-10b). */
export function createBaseLooks(log: Logger, ended: () => void = () => undefined): BaseLooks {
  const running = new Map<TerritoryId, AbortController>();
  const live = new Set<Promise<void>>();
  const looks: BaseLooks = {
    found: new Set(),
    looked: new Map(),
    tips: new Map(),
    start: (ctx, look) => {
      if (running.has(look.territory)) return;
      looks.looked.set(look.territory, ctx.deps.clock.now());
      const control = new AbortController();
      running.set(look.territory, control);
      const done = lookAt(ctx, look, control.signal)
        .catch((error: unknown) => {
          log.warn(`steward: the look at the base branch of ${look.territory} stopped: ${messageOf(error)}`);
        })
        .then(() => {
          running.delete(look.territory);
          if (!control.signal.aborted) ended();
        });
      live.add(done);
      void done.finally(() => live.delete(done));
    },
    idle: async () => {
      await Promise.all(live);
    },
    stop: async () => {
      for (const control of running.values()) control.abort();
      await Promise.all(live);
    },
  };
  return looks;
}
