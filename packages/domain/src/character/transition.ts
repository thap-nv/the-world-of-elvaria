// transitionCharacter(character, event): the only way a character changes status (implementation-plan §2.6).
// Only the Steward writes characters/*.json (ADR 0005); it applies these events next to the quest events.
import { err, ok } from '../core/result.ts';
import { CharacterSchema } from '../schema/character/character.ts';
import { CHARACTER_TRANSITIONS } from './transitions.ts';
import type { QuestId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { Character, CharacterStatus } from '../schema/character/character.ts';
import type { CharacterEventType, CharacterTransitionRow, StatusBeforeSleep } from './transitions.ts';
import type { z } from 'zod';

type Taking = 'claim' | 'assign_verify';
// Distributive over T: one union member per event type.
type Plain<T extends CharacterEventType> = T extends CharacterEventType
  ? { readonly type: T; readonly at: string }
  : never;

export type CharacterEvent =
  /** The quest the character now holds, as assignee (claim) or verifier (assign_verify). */
  (Plain<Taking> & { readonly quest: QuestId }) | Plain<Exclude<CharacterEventType, Taking>>;

export type CharacterTransitionError =
  | { readonly code: 'no_transition'; readonly from: CharacterStatus; readonly event: CharacterEventType }
  /** The new character fails its schema, e.g. an `at` that is not ISO 8601; `issues` are English, for logs. */
  | { readonly code: 'invalid_result'; readonly issues: readonly string[] };

const ROLE_TAKEN = { claim: 'assignee', assign_verify: 'verifier' } as const;

/** Statuses in which the character still holds its quest (current). */
const HOLDING: readonly CharacterStatus[] = ['working', 'reviewing', 'meditating', 'swamp'];

/**
 * The quest the character holds afterwards: the one it takes on, the one it keeps while it works, meditates,
 * sits in the swamp or sleeps over a paused quest; none otherwise.
 */
function currentAfter(
  character: Character,
  event: CharacterEvent,
  status: CharacterStatus,
  sleepsOn: StatusBeforeSleep | undefined,
): Character['current'] {
  if (event.type === 'claim' || event.type === 'assign_verify') {
    return { quest: event.quest, role: ROLE_TAKEN[event.type] };
  }
  const keeps = HOLDING.includes(status) || (status === 'sleeping_mana' && sleepsOn === 'working');
  return keeps ? (character.current ?? null) : null;
}

function next(character: Character, event: CharacterEvent, row: CharacterTransitionRow): Character {
  // status_before_sleep exists only while the character sleeps (§2.6), so it is dropped, then set again by rows
  // that send the character to sleep.
  const { status_before_sleep: before, ...rest } = character;
  // Only sleeping_mana leads back to before_sleep, and the schema requires status_before_sleep there; a
  // character that lost it wakes idle.
  const status = row.to === 'before_sleep' ? (before ?? 'idle') : row.to;
  return {
    ...rest,
    ...(row.remember === undefined ? {} : { status_before_sleep: row.remember }),
    status,
    // status_since dates the status, so a change of quest within one status does not reset it.
    status_since: status === character.status ? character.status_since : event.at,
    current: currentAfter(character, event, status, row.remember),
  };
}

const issuesOf = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`);

/** The character after `event`, by the one row of CHARACTER_TRANSITIONS that takes it from its status. */
export function transitionCharacter(
  character: Character,
  event: CharacterEvent,
): Result<Character, CharacterTransitionError> {
  const row = CHARACTER_TRANSITIONS.find(
    (candidate) => candidate.from.includes(character.status) && candidate.events.includes(event.type),
  );
  if (row === undefined) return err({ code: 'no_transition', from: character.status, event: event.type });
  const parsed = CharacterSchema.safeParse(next(character, event, row));
  if (!parsed.success) return err({ code: 'invalid_result', issues: issuesOf(parsed.error) });
  return ok(parsed.data);
}
