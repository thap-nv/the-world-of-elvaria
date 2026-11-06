// The character state machine as data (implementation-plan §2.6). A character's status follows the quest it
// holds; the Steward applies the matching character event whenever it applies a quest event. Read before
// changing: implementation-plan §2.5 (the quest side of the same moments).
import type { CharacterStatus, STATUSES_BEFORE_SLEEP } from '../schema/character/character.ts';

export const CHARACTER_EVENT_TYPES = [
  'claim',
  'assign_verify',
  'submit',
  'ask',
  'cancel',
  'crash',
  'unassign',
  'compact_start',
  'compact_end',
  'breaker',
  'quest_infirmary',
  'verdict',
  'mana_out',
  'mana_restored',
  'fail_streak',
  'send_to_temple',
  'temple_done',
  'release',
  'suspend',
] as const;
export type CharacterEventType = (typeof CHARACTER_EVENT_TYPES)[number];

export type StatusBeforeSleep = (typeof STATUSES_BEFORE_SLEEP)[number];

export interface CharacterTransitionRow {
  readonly from: readonly CharacterStatus[];
  readonly events: readonly CharacterEventType[];
  /** `before_sleep`: back to `status_before_sleep`, the status the tribe's mana ran out in. */
  readonly to: CharacterStatus | 'before_sleep';
  /** Kept as `status_before_sleep` while the character sleeps. */
  readonly remember?: StatusBeforeSleep;
}

const ALL_BUT_SUSPENDED: readonly CharacterStatus[] = [
  'idle',
  'working',
  'reviewing',
  'sleeping_mana',
  'meditating',
  'swamp',
];

export const CHARACTER_TRANSITIONS: readonly CharacterTransitionRow[] = [
  { from: ['idle'], events: ['claim'], to: 'working' },
  { from: ['idle'], events: ['assign_verify'], to: 'reviewing' },
  { from: ['working'], events: ['submit', 'ask'], to: 'idle' },
  // unassign: the Steward took the quest away (spawn failed, or the owner gave it to someone else).
  { from: ['working', 'meditating'], events: ['cancel', 'crash', 'unassign'], to: 'idle' },
  { from: ['working'], events: ['compact_start'], to: 'meditating' },
  { from: ['meditating'], events: ['compact_end'], to: 'working' },
  // Any breaker of the assignee (time, tokens, turns) sends it to the swamp while the quest goes to the infirmary.
  { from: ['working', 'meditating'], events: ['breaker'], to: 'swamp' },
  { from: ['swamp'], events: ['quest_infirmary'], to: 'idle' },
  // A verifier stopped by a breaker leaves a partial verdict and the quest stays in review: no infirmary.
  { from: ['reviewing'], events: ['verdict', 'breaker', 'cancel', 'unassign'], to: 'idle' },
  { from: ['idle'], events: ['mana_out'], to: 'sleeping_mana', remember: 'idle' },
  // The paused quest keeps its assignee, who wakes into a fresh session of the same attempt (§3.5).
  { from: ['working', 'meditating'], events: ['mana_out'], to: 'sleeping_mana', remember: 'working' },
  // The quest drops a sleeping verifier (§2.5, review on mana_out), so there is no review to wake back into.
  { from: ['reviewing'], events: ['mana_out'], to: 'sleeping_mana', remember: 'idle' },
  // The owner gave the paused quest to someone else while this tribe slept.
  { from: ['sleeping_mana'], events: ['unassign'], to: 'sleeping_mana', remember: 'idle' },
  { from: ['sleeping_mana'], events: ['mana_restored'], to: 'before_sleep' },
  // fail_streak: kingdom.breakers.same_fail_suspend returns of the same fail_kind in a row.
  { from: ['idle'], events: ['fail_streak', 'send_to_temple'], to: 'suspended' },
  { from: ['suspended'], events: ['temple_done', 'release'], to: 'idle' },
  // The owner suspends from any status. The quest goes on without the character (§2.5): returned when it was
  // the assignee, back in review without a verifier when it was the verifier.
  { from: ALL_BUT_SUSPENDED, events: ['suspend'], to: 'suspended' },
];
