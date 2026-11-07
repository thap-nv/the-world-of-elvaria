// The sub-quests a plan quest delivers (implementation-plan §3.13, P1-14): its assignee writes them as quest-draft
// JSON in this file at the root of its plot, the judge reads them there with the rest of the branch, and the Steward
// creates them once the quest is done. A file in the plot, because the plot is the only place a character writes
// (besides its handover letter).
export const SUBQUESTS_FILE = 'subquests.json';
