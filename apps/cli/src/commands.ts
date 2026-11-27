// Every command of `elvaria`, in the order help lists them. Later tasks add theirs here.
import { CHARACTER_ADD } from './character/add.ts';
import { CHARACTER_LEVEL } from './character/level.ts';
import { CHARACTER_LIST } from './character/list.ts';
import { CHARACTER_MODEL } from './character/model.ts';
import { CHARACTER_RELEASE, CHARACTER_SUSPEND } from './character/suspend.ts';
import { DIGEST } from './digest/digest.ts';
import { DOCTOR } from './doctor/doctor.ts';
import { HERALD } from './herald/herald.ts';
import { HERALD_DEVICE } from './herald/device.ts';
import { HERALD_DEVICES } from './herald/list.ts';
import { HERALD_PAIR } from './herald/pair.ts';
import { HERALD_REVOKE } from './herald/revoke.ts';
import { INIT } from './init/init.ts';
import { MEMO_DECIDE } from './memo/decide.ts';
import { MEMO_LIST } from './memo/list.ts';
import { MEMO_SHOW } from './memo/show.ts';
import { METRICS } from './metrics/metrics.ts';
import { MIGRATE } from './migrate/migrate.ts';
import { QUEST_ADD } from './quest/add.ts';
import { ANSWER } from './quest/answer.ts';
import { QUEST_EDIT } from './quest/edit.ts';
import { QUEST_DELIVER } from './quest/deliver.ts';
import { QUEST_ESCAPED } from './quest/escaped.ts';
import { QUEST_HOLD, QUEST_UNHOLD } from './quest/hold.ts';
import { QUEST_ARCHIVE, QUEST_CANCEL, QUEST_CONFIRM, QUEST_RETRY, QUEST_SUBMIT } from './quest/lifecycle.ts';
import { QUEST_LIST } from './quest/list.ts';
import { RETURN, SEAL } from './quest/owner-verdict.ts';
import { QUEST_REASSIGN } from './quest/reassign.ts';
import { QUEST_SHOW } from './quest/show.ts';
import { RUN } from './run/run.ts';
import { SANDBOX_GENERATE } from './sandbox/generate.ts';
import { SANDBOX_REPLAY } from './sandbox/replay.ts';
import { SAY } from './say/say.ts';
import { SCRIPTURE_LINT } from './scripture/lint.ts';
import { SCRIPTURE_LIST } from './scripture/list.ts';
import { TEMPLE_EVIDENCE } from './temple/evidence.ts';
import { TEMPLE_RUN } from './temple/run.ts';
import { TERRITORY_ADD } from './territory/add.ts';
import { TERRITORY_CHECK } from './territory/check.ts';
import { TERRITORY_CHECKS } from './territory/check-policy.ts';
import { TERRITORY_DELEGATION } from './territory/delegation.ts';
import { TERRITORY_DELIVERY } from './territory/delivery.ts';
import { TERRITORY_PATROL } from './territory/patrol.ts';
import { TERRITORY_ENQUEUE } from './territory/enqueue.ts';
import { TERRITORY_GRAPH } from './territory/graph.ts';
import { TERRITORY_LIST } from './territory/list.ts';
import { TRIAGE } from './triage/triage.ts';
import { TRIBE_ADD } from './tribe/add.ts';
import { TRIBE_CHECK } from './tribe/check.ts';
import { TRIBE_DISABLE } from './tribe/disable.ts';
import { TRIBE_LIST } from './tribe/list.ts';
import { TRIBE_LOOK } from './tribe/look.ts';
import { UPGRADE } from './upgrade/upgrade.ts';
import { WAKE } from './tribe/wake.ts';
import { WATCH } from './watch/watch.ts';
import type { CommandSpec } from './command-table/command.ts';

export const COMMANDS: readonly CommandSpec[] = [
  INIT,
  DOCTOR,
  TRIBE_LIST,
  TRIBE_ADD,
  TRIBE_CHECK,
  TRIBE_DISABLE,
  TRIBE_LOOK,
  TERRITORY_ADD,
  TERRITORY_LIST,
  TERRITORY_CHECK,
  TERRITORY_CHECKS,
  TERRITORY_GRAPH,
  TERRITORY_DELIVERY,
  TERRITORY_DELEGATION,
  TERRITORY_PATROL,
  TERRITORY_ENQUEUE,
  CHARACTER_ADD,
  CHARACTER_LIST,
  CHARACTER_SUSPEND,
  CHARACTER_RELEASE,
  CHARACTER_LEVEL,
  CHARACTER_MODEL,
  SCRIPTURE_LINT,
  SCRIPTURE_LIST,
  TEMPLE_EVIDENCE,
  TEMPLE_RUN,
  SAY,
  QUEST_ADD,
  QUEST_LIST,
  QUEST_SHOW,
  QUEST_CONFIRM,
  QUEST_CANCEL,
  QUEST_ARCHIVE,
  QUEST_HOLD,
  QUEST_UNHOLD,
  QUEST_EDIT,
  QUEST_RETRY,
  QUEST_SUBMIT,
  QUEST_DELIVER,
  QUEST_ESCAPED,
  QUEST_REASSIGN,
  SEAL,
  RETURN,
  ANSWER,
  MEMO_LIST,
  MEMO_SHOW,
  MEMO_DECIDE,
  TRIAGE,
  RUN,
  HERALD,
  HERALD_PAIR,
  HERALD_DEVICES,
  HERALD_DEVICE,
  HERALD_REVOKE,
  WAKE,
  DIGEST,
  WATCH,
  METRICS,
  SANDBOX_GENERATE,
  SANDBOX_REPLAY,
  MIGRATE,
  UPGRADE,
];
