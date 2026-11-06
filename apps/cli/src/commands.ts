// Every command of `elvaria`, in the order help lists them. Later tasks add theirs here: say, seal, return (P1-04,
// P1-13), sandbox (P0-10), tribe (P1-19), run (the Steward, P1-03).
import { CHARACTER_ADD } from './character/add.ts';
import { CHARACTER_LIST } from './character/list.ts';
import { DOCTOR } from './doctor/doctor.ts';
import { INIT } from './init.ts';
import { MIGRATE } from './migrate.ts';
import { QUEST_ADD } from './quest/add.ts';
import { QUEST_EDIT } from './quest/edit.ts';
import { QUEST_CANCEL, QUEST_CONFIRM } from './quest/lifecycle.ts';
import { QUEST_LIST } from './quest/list.ts';
import { QUEST_SHOW } from './quest/show.ts';
import { TERRITORY_ADD } from './territory/add.ts';
import { TERRITORY_LIST } from './territory/list.ts';
import type { CommandSpec } from './command.ts';

export const COMMANDS: readonly CommandSpec[] = [
  INIT,
  DOCTOR,
  TERRITORY_ADD,
  TERRITORY_LIST,
  CHARACTER_ADD,
  CHARACTER_LIST,
  QUEST_ADD,
  QUEST_LIST,
  QUEST_SHOW,
  QUEST_CONFIRM,
  QUEST_CANCEL,
  QUEST_EDIT,
  MIGRATE,
];
