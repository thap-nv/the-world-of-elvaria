// The digest (implementation-plan §3.16.3, PS-03): the first scheduled job, in the tick and without a model. The
// Steward decides when (dueJobs) and what (attentionQueue over the world state and its own notices); the Digest port
// of the composition root words it in the owner's language and writes `digest/<day>.md`. Then one line and one ring.
import { attentionQueue, reduce, worldStateOf } from '@elvaria/domain';
import type {
  Character,
  Event,
  Kingdom,
  Memo,
  Quest,
  QuestId,
  StewardNotices,
  Territory,
  WorldState,
} from '@elvaria/domain';

import { ring } from '../context.ts';
import { STEWARD } from '../record.ts';
import { judgingClassesOf } from '../unjudgeable.ts';
import type { Context } from '../context.ts';
import type { State } from '../steward-state.ts';
import type { World } from '../world.ts';
import type { Digest } from './ports.ts';
import type { StewardJob } from './scheduler.ts';

/** The files the digest reads, as the Steward's world or the CLI's reader holds them. */
export interface DigestSource {
  readonly kingdom: Kingdom;
  readonly territories: readonly Territory[];
  readonly characters: readonly Character[];
  readonly quests: readonly Quest[];
  readonly memos: readonly Memo[];
}

const MANA_LINES: ReadonlySet<string> = new Set(['mana.level', 'mana.exhausted', 'mana.restored']);

/**
 * The world state of the files, with mana as the log last read it: the readings and the pools asleep live in the
 * Steward's memory and in the log, not in a file (worldStateOf alone sees every pool awake).
 */
export function digestStateOf(source: DigestSource, events: readonly Event[]): WorldState {
  const state = worldStateOf({ ...source, campaigns: [] });
  return reduce(
    state,
    events.filter((event) => MANA_LINES.has(event.type)),
  );
}

/** A judging class for the command that summons a judge; `<class>` when no class judges the quest's kind. */
const classOf = (world: World, id: QuestId): string => {
  const quest = world.quests.get(id);
  return (quest === undefined ? undefined : judgingClassesOf(world, quest)[0]) ?? '<class>';
};

/** What the Steward knows that no file holds, as this tick left it (unclaimable.ts, unjudgeable.ts, judge-waits.ts). */
export function noticesOf(
  world: World,
  state: Pick<State, 'reported' | 'unjudged' | 'judgeWaits'>,
): StewardNotices {
  return {
    unclaimable: [...state.reported.keys()],
    unjudgeable: [...state.unjudged].map((quest) => ({ quest, class: classOf(world, quest) })),
    judge_waits: [...state.judgeWaits.values()].map(({ quest, gauges }) => ({
      quest,
      class: classOf(world, quest),
      gauges,
    })),
  };
}

const sourceOf = (world: World, memos: readonly Memo[]): DigestSource => ({
  kingdom: world.kingdom,
  territories: [...world.territories.values()],
  characters: [...world.characters.values()],
  quests: [...world.quests.values()],
  memos,
});

/** The digest as a job: the port writes the file, the Steward writes `digest.written` and rings once. */
export const digestJob = (digest: Digest): StewardJob => ({
  id: 'digest',
  mode: 'in_tick',
  run: async (ctx: Context, run) => {
    const [memos, log] = await Promise.all([ctx.deps.store.memos.list(), ctx.deps.events.read()]);
    const state = digestStateOf(sourceOf(ctx.world, memos.items), log.events);
    const items = attentionQueue(state, ctx.deps.clock.now(), run.notices);
    const file = await digest.write({ day: run.day, items });
    const must = items.filter(({ group }) => group === 'must').length;
    const counts = { must, can_wait: items.length - must };
    await ctx.record.note({
      type: 'digest.written',
      actor: STEWARD,
      data: { day: run.day, file, ...counts },
    });
    await ring(ctx, { kind: 'digest', day: run.day, file, ...counts });
  },
});
