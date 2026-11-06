// What every step of the scripted Steward shares while a fake day plays: the tables, the dice, the files and the
// agenda of things that will happen later (a session ends, a verdict comes in, a script finishes).
import type {
  Character,
  IdSource,
  Kingdom,
  Quest,
  QuestId,
  Registry,
  Role,
  ZonedTime,
} from '@elvaria/domain';

import type { DayClock } from './day-clock.ts';
import type { Dice } from './dice.ts';
import type { Ledger } from './ledger.ts';
import type { Scenario, SessionEnd } from './scenario.ts';

export type Happening =
  | {
      readonly kind: 'end';
      readonly quest: QuestId;
      readonly session: string;
      readonly end: SessionEnd;
      readonly tokens: number;
    }
  | { readonly kind: 'tool'; readonly quest: QuestId; readonly session: string }
  | {
      readonly kind: 'verdict';
      readonly quest: QuestId;
      readonly session: string;
      readonly result: 'pass' | 'fail';
    }
  | {
      readonly kind: 'script';
      readonly quest: QuestId;
      readonly run: number;
      readonly result: 'pass' | 'crash';
    };

export interface Day {
  readonly scenario: Scenario;
  readonly kingdom: Kingdom;
  readonly registry: Registry;
  /** Titles, questions and answers come in the owner's language (kingdom.owner.locale). */
  readonly locale: 'vi' | 'en';
  readonly dice: Dice;
  readonly clock: DayClock;
  readonly ids: IdSource;
  /** The kingdom's zone: lines and quest files store time in it (§2.1). */
  readonly zoned: ZonedTime;
  readonly ledger: Ledger;
  readonly agenda: Map<number, Happening[]>;
  /** The minute the owner acts on a quest that waits for them: a seal, an answer, a retry. */
  readonly owner: Map<QuestId, number>;
  /** Tokens each tribe's sessions used since its pool last woke: what the `estimate` gauge reads (§3.5). */
  readonly tokens: Map<string, number>;
}

/** `happening` takes place `after` minutes from now. */
export function schedule(day: Day, after: number, happening: Happening): void {
  const minute = day.clock.minute() + after;
  day.agenda.set(minute, [...(day.agenda.get(minute) ?? []), happening]);
}

const UUID_GROUPS = [4, 2, 2, 2, 6];

/** A session id shaped like the CLIs' own (a UUID), drawn from the seed. */
export function sessionId(day: Day): string {
  const hex = [...day.dice.random.bytes(16)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  let at = 0;
  return UUID_GROUPS.map((bytes) => hex.slice(at, (at += bytes * 2))).join('-');
}

export const tribeAsleep = (day: Day, tribe: string): boolean =>
  day.ledger.pools().some((pool) => pool.tribe === tribe && pool.asleep);

const tribeEnabled = (day: Day, tribe: string): boolean =>
  day.kingdom.tribes.some((entry) => entry.id === tribe && entry.enabled);

/** Idle, of an enabled tribe that is awake: free to take a quest, a review or an answer. */
export const isFree = (day: Day, character: Character): boolean =>
  character.status === 'idle' && tribeEnabled(day, character.tribe) && !tribeAsleep(day, character.tribe);

/** Whether `session` is still the open session of `role` on the quest; a pause or a cancel closed it. */
export const holds = (quest: Quest, role: Role, session: string): boolean =>
  quest.attempt_log.some(
    (entry) => entry.role === role && entry.ended_at === undefined && entry.session_id === session,
  );

/** The id of the open session of `role` on the quest: every session of a fake day has one. */
export function sessionOf(quest: Quest, role: Role): string {
  const entry = quest.attempt_log.findLast((open) => open.role === role && open.ended_at === undefined);
  if (entry?.session_id === undefined) throw new Error(`sandbox: ${quest.id} has no open ${role} session`);
  return entry.session_id;
}

/** A quest that now waits for the owner gets the minute the owner will act on it. */
export function noteWaits(day: Day, quest: Quest): void {
  const waits =
    quest.status === 'awaiting_seal' ||
    (quest.status === 'blocked' && typeof quest.assignee === 'string') ||
    (quest.status === 'infirmary' && day.scenario.ownerRetries);
  if (waits && !day.owner.has(quest.id)) {
    day.owner.set(quest.id, day.clock.minute() + day.dice.int(day.scenario.minutes.owner));
  }
}

export const addTokens = (day: Day, tribe: string, tokens: number): void => {
  day.tokens.set(tribe, (day.tokens.get(tribe) ?? 0) + tokens);
};
