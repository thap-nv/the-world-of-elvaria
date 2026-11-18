// The owner's hold on a quest between two runs (fix/quest-hold, gap (10) of run (130)): a held quest keeps its status,
// its description, its dependencies and the assignee the owner named, and planTick neither claims nor starts it, as
// it does with an unfinished dependency. Before, the owner's only way to stop an open quest was `quest cancel`, which
// archives it: the five parts d8–d12 of run (130) were cancelled and their text kept outside the kingdom.
import { err, ok } from '../core/result.ts';
import type { Result } from '../core/result.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { QuestStatus } from '../schema/quest/shared.ts';

/**
 * A quest no session has started: open, or claimed and waiting for its character (the owner's `--to`, or a claim the
 * Steward made before it stopped). Later statuses have a session or a verdict the hold could not stop.
 */
export const HOLDABLE_STATUSES = ['open', 'claimed'] as const satisfies readonly QuestStatus[];

export type HoldError =
  | { readonly code: 'not_holdable'; readonly status: QuestStatus }
  | { readonly code: 'already_held' }
  | { readonly code: 'not_held' };

export const isHeld = (quest: Quest): boolean => quest.held !== undefined;

/** Why the owner may not hold `quest` now, if it may not; the CLI asks before it writes the command. */
export function holdRefusal(quest: Quest): HoldError | undefined {
  if (!(HOLDABLE_STATUSES as readonly QuestStatus[]).includes(quest.status))
    return { code: 'not_holdable', status: quest.status };
  return isHeld(quest) ? { code: 'already_held' } : undefined;
}

/** Why the owner may not lift the hold on `quest`: it has none. */
export const unholdRefusal = (quest: Quest): HoldError | undefined =>
  isHeld(quest) ? undefined : { code: 'not_held' };

/** `hold`: the quest as the owner holds it at `at`, with why when the owner says. */
export function holdQuest(
  quest: Quest,
  hold: { readonly at: string; readonly reason?: string | undefined },
): Result<Quest, HoldError> {
  const refusal = holdRefusal(quest);
  if (refusal !== undefined) return err(refusal);
  // An empty reason says nothing; the field is never an empty string.
  const reason = hold.reason === undefined || hold.reason.trim() === '' ? {} : { reason: hold.reason };
  return ok({ ...quest, held: { at: hold.at, ...reason }, updated_at: hold.at });
}

/** `unhold`: the quest without its hold; the next tick claims or starts it as any other. */
export function unholdQuest(quest: Quest, at: string): Result<Quest, HoldError> {
  const refusal = unholdRefusal(quest);
  if (refusal !== undefined) return err(refusal);
  const { held: _, ...rest } = quest;
  return ok({ ...rest, updated_at: at });
}

/** A quest the owner holds, with why when the owner said (the digest's `quest_held` item, (D) of fix/quest-hold). */
export interface HeldQuest {
  readonly quest: Quest['id'];
  readonly reason?: string;
}

/**
 * The quests the owner holds that still wait on it, oldest hold first: a held quest cancelled since keeps its `held`
 * field, but nothing waits on it any more.
 */
export const heldQuestsOf = (quests: readonly Quest[]): HeldQuest[] =>
  quests
    .flatMap(({ id, status, held }) =>
      held !== undefined && (HOLDABLE_STATUSES as readonly QuestStatus[]).includes(status)
        ? [{ id, held }]
        : [],
    )
    .toSorted((a, b) => a.held.at.localeCompare(b.held.at) || a.id.localeCompare(b.id))
    .map(({ id, held }) => ({ quest: id, ...(held.reason === undefined ? {} : { reason: held.reason }) }));
