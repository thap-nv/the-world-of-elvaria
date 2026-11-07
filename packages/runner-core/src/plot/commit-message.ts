// The messages of the commits the Steward makes in a plot (implementation-plan §3.3, chosen by the owner after
// P1-07): Conventional Commits, because a territory with commitlint refuses `submit:` or `wip:` as a type (the
// Elvaria repo does). A territory with another convention (a required scope, a ticket prefix) will get an optional
// template in territory.json when one needs it; until then a refusal is reported, never bypassed.
import type { QuestId } from '@elvaria/domain';

export const plotCommitMessage = {
  /** When an assignee's session completes, before review: the judge reads the work as the branch's diff. */
  submit: (quest: QuestId): string => `chore: submit ${quest}`,
  /** Before a kill or a pause; `reason` is the breaker that tripped (`time`, `tokens`, `turns`) or `mana`. */
  wip: (quest: QuestId, reason: string): string => `chore: wip ${quest} (${reason})`,
} as const;
