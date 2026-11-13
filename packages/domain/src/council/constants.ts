// The council (implementation-plan §3.16.6, ADR 0028, PS-06): when work goes through it, and the quest template every
// quest the Chancellor or a mage drafts follows (owner, 2026-11-12). Data, named once: the prompts quote the headings,
// the machine checks them.
import type { Rank } from '../schema/common.ts';

/** kingdom.dispatch.council: work of rank B and above, or carrying two tags over two areas (ADR 0028). */
export const COUNCIL_DEFAULTS = { from_rank: 'B', from_areas: 2 } as const satisfies {
  readonly from_rank: Rank;
  readonly from_areas: number;
};
/** Two tags in two areas at the least: a single tag or a single area is never "several" (ADR 0028). */
export const COUNCIL_AREAS_MIN = 2;

/**
 * The sections of a quest's description, in order, with the heading each has (`## Goal`): English, like the handover
 * letter's, whatever the owner's language. `steps` is required up to STEPS_REQUIRED_UP_TO only; every other one always.
 */
export const QUEST_TEMPLATE_SECTIONS = [
  { id: 'goal', heading: 'Goal' },
  { id: 'steps', heading: 'Steps' },
  { id: 'files', heading: 'Files' },
  { id: 'done_when', heading: 'Done when' },
  { id: 'do_not_touch', heading: 'Do not touch' },
  { id: 'known_traps', heading: 'Known traps' },
] as const;
export type QuestTemplateSection = (typeof QUEST_TEMPLATE_SECTIONS)[number]['id'];

/**
 * The highest rank whose quests list their steps in order: F to D are the ranks a new character, and the weaker models
 * the owner gives low levels, take (canTake). From C the description gives the goal and the constraints, and the
 * assignee chooses the way and says so under "Decisions taken" (owner, 2026-11-12).
 */
export const STEPS_REQUIRED_UP_TO: Rank = 'D';
