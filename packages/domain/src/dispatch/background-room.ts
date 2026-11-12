// What machine work starts outside the tick now (implementation-plan §3.1; P1-47, P1-54): the checks of submitted
// quests and script-tier runs, in the room dispatch.max_background leaves beside the work running. A sandbox day has
// no background, so no cap: its checks take no time.
// P1-50 measured what the cap alone did on dc1 (report §7, (f) of §8): two trials of the ritual with a scratch plot,
// an hour each, held both slots, so a `format` check of six seconds waited 41 minutes, and the checks of two
// acceptance parts, which run no command at all, kept every part of two parties waiting. So an acceptance part goes
// first and takes no slot, and a trial never takes the last lane of short work: when trials hold every slot, one
// check or script that is not a trial still runs beside them.
import { judgedInScratch } from '../verify/ritual-of.ts';
import type { BackgroundWork } from './reviews.ts';
import type { QuestId } from '../core/ids.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Registry } from '../schema/registry.ts';

/** What the room is decided from: the cap, the quests, the rituals that say which checks are trials. */
export interface RoomSource {
  readonly kingdom: { readonly dispatch: Pick<Kingdom['dispatch'], 'max_background'> };
  readonly quests: readonly Quest[];
  /** Without kinds and rituals no check counts as a trial. */
  readonly registry: Partial<Pick<Registry, 'kinds' | 'rituals'>>;
  readonly background?: BackgroundWork;
}

export interface StartingNow {
  readonly checks: QuestId[];
  readonly scripts: QuestId[];
}

/**
 * The blind trial's acceptance part runs no command of its territory (runner-core selectChecks, P1-21): its checks
 * are the Steward's own, done in a moment, and the parts and the merge quest of its party wait for them.
 */
const runsNoCommand = (quest: Quest | undefined): boolean => quest?.party_role === 'acceptance';

/** A trial in a scratch plot: commands.reset, three runs of the checks, coverage on two commits (ADR 0022). */
function isTrial(quest: Quest | undefined, registry: RoomSource['registry']): boolean {
  const { kinds, rituals } = registry;
  if (quest === undefined || kinds === undefined || rituals === undefined) return false;
  return quest.tier === 'session' && judgedInScratch(quest, { kinds, rituals });
}

/**
 * The checks (acceptance parts first, then in the order given) and scripts that start now. Each takes a free slot of
 * dispatch.max_background; when none is free and only trials run, one piece of work that is no trial runs beside
 * them. What finds no room waits for a later tick's plan.
 */
export function startingNow(
  source: RoomSource,
  checks: readonly QuestId[],
  scripts: readonly QuestId[],
): StartingNow {
  const { background } = source;
  if (background === undefined) return { checks: [...checks], scripts: [...scripts] };
  const byId = new Map(source.quests.map((quest) => [quest.id, quest]));
  const trial = (id: QuestId): boolean => isTrial(byId.get(id), source.registry);
  let room = source.kingdom.dispatch.max_background - background.running.length;
  let short = background.running.filter((id) => !trial(id)).length;
  const fits = (id: QuestId): boolean => {
    if (room > 0 || (!trial(id) && short === 0)) {
      room -= 1;
      if (!trial(id)) short += 1;
      return true;
    }
    return false;
  };
  const free = checks.filter((id) => runsNoCommand(byId.get(id)));
  const rest = checks.filter((id) => !runsNoCommand(byId.get(id))).filter(fits);
  return { checks: [...free, ...rest], scripts: scripts.filter(fits) };
}
