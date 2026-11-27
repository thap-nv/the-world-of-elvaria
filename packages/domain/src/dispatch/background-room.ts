// What machine work starts outside the tick now (implementation-plan §3.1; P1-47, P1-54): the checks of submitted
// quests and script-tier runs, in the room dispatch.max_background leaves beside the work running. A sandbox day has
// no background, so no cap: its checks take no time.
// P1-50 measured what the cap alone did on dc1 (report §7, (f) of §8): two trials of the ritual with a scratch plot,
// an hour each, held both slots, so a `format` check of six seconds waited 41 minutes, and the checks of two
// acceptance parts, which run no command at all, kept every part of two parties waiting. So an acceptance part goes
// first and takes no slot, and a trial never takes the last lane of short work: when trials hold every slot, one
// check or script that is not a trial still runs beside them. (PS-09, K4, (iii) of PS-08c) A delivery to the forge
// takes a slot too, after the checks and the scripts: the merge queue runs every check of its territory on the updated
// branch and the push runs its pre-push hook. It is never a trial, so it may run beside trials as short work does; a
// question to the forge about a pull request takes none (it runs for seconds), though it sits in `running` while it
// does. (CM-03) A patrol outside the tick holds a slot too (BackgroundWork.patrols), never a trial; (CM-07) so does a
// guest entry of the merge queue, after the deliveries; (CM-08) and a delivery train, after the guests.
import { judgedInScratch } from '../verify/ritual-of.ts';
import type { GuestEntry } from './guests.ts';
import type { TrainRun } from './train.ts';
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
  readonly deliveries: QuestId[];
  readonly guests: GuestEntry[];
  readonly trains: TrainRun[];
}

/**
 * The blind trial's acceptance part runs no command of its territory (runner-core selectChecks, P1-21): its checks
 * are the Steward's own, done in a moment, and the parts and the merge quest of its party wait for them.
 */
const runsNoCommand = (quest: Quest | undefined): boolean => quest?.party_role === 'acceptance';

/**
 * A trial in a scratch plot: commands.reset, three runs of the checks, coverage on two commits (ADR 0022). A done
 * quest's work is its delivery (PS-09), never a trial, whatever ritual judged it.
 */
function isTrial(quest: Quest | undefined, registry: RoomSource['registry']): boolean {
  const { kinds, rituals } = registry;
  if (quest === undefined || kinds === undefined || rituals === undefined || quest.status === 'done')
    return false;
  return quest.tier === 'session' && judgedInScratch(quest, { kinds, rituals });
}

/**
 * The checks (acceptance parts first, then in the order given), scripts, deliveries, guests and trains that start now. Each takes a
 * free slot of dispatch.max_background; when none is free and only trials run, one piece of work that is no trial
 * runs beside them. What finds no room waits for a later tick's plan.
 */
export function startingNow(
  source: RoomSource,
  checks: readonly QuestId[],
  scripts: readonly QuestId[],
  deliveries: readonly QuestId[] = [],
  guests: readonly GuestEntry[] = [],
  trains: readonly TrainRun[] = [],
): StartingNow {
  const { background } = source;
  if (background === undefined)
    return {
      checks: [...checks],
      scripts: [...scripts],
      deliveries: [...deliveries],
      guests: [...guests],
      trains: [...trains],
    };
  const byId = new Map(source.quests.map((quest) => [quest.id, quest]));
  const trial = (id: QuestId): boolean => isTrial(byId.get(id), source.registry);
  // (CM-03) A patrol outside the tick holds a slot and is short work: no lane is left beside it either; (CM-07) a guest
  // and (CM-08) a train too.
  const patrols =
    (background.patrols ?? 0) + (background.guests?.length ?? 0) + (background.trains?.length ?? 0);
  let room = source.kingdom.dispatch.max_background - background.running.length - patrols;
  let short = background.running.filter((id) => !trial(id)).length + patrols;
  const takes = (isTrial: boolean): boolean => {
    if (room > 0 || (!isTrial && short === 0)) {
      room -= 1;
      if (!isTrial) short += 1;
      return true;
    }
    return false;
  };
  const fits = (id: QuestId): boolean => takes(trial(id));
  const free = checks.filter((id) => runsNoCommand(byId.get(id)));
  const rest = checks.filter((id) => !runsNoCommand(byId.get(id))).filter(fits);
  const ran = scripts.filter(fits);
  const delivering = deliveries.filter(fits);
  return {
    checks: [...free, ...rest],
    scripts: ran,
    deliveries: delivering,
    guests: guests.filter(() => takes(false)),
    trains: trains.filter(() => takes(false)),
  };
}
