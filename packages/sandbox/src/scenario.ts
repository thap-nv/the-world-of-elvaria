// What a fake day is made of, as data (implementation-plan §7): who lives in the kingdom, which quests arrive,
// and the odds of what characters do with them. The day itself is played by the domain's own state machines
// (simulate.ts), so a table can make a day busy or dull, but never invalid.
import type { Rank } from '@elvaria/domain';

import type { Range, Weights } from './dice.ts';

export const DAYS = ['busy', 'quiet', 'mana-out'] as const;
export type DayId = (typeof DAYS)[number];
export const isDayId = (value: string): value is DayId => (DAYS as readonly string[]).includes(value);

/** A quest title in both languages; the day uses the kingdom owner's (kingdom.owner.locale). */
export interface Title {
  readonly vi: string;
  readonly en: string;
}

/** A character summoned on the morning of the day, with a past: verdicts from earlier days. */
export interface CastMember {
  readonly id: string;
  readonly cls: string;
  readonly tribe: string;
  readonly model: string;
  readonly level: number;
  /** How many verdicts it already has, and how many of them passed (0–1), on these tags. */
  readonly history: { readonly verdicts: number; readonly pass: number; readonly tags: readonly string[] };
}

export interface TerritorySeed {
  readonly id: string;
  readonly name: string;
  readonly kind: 'code' | 'docs';
}

/** One kind of quest that may arrive, on one territory. `cls` for the session tier, `script` for the script tier. */
export interface QuestTemplate {
  readonly kind: string;
  readonly territory: string;
  readonly cls?: string;
  readonly script?: string;
  readonly tags: readonly string[];
  readonly ranks: Weights<Rank>;
  /** How often this template is drawn, against the others of the day. */
  readonly weight: number;
  readonly titles: readonly Title[];
}

/** How a session of the assignee ends (§2.5): submitted, crashed, a question for the owner, the time breaker. */
export type SessionEnd = 'submit' | 'crash' | 'ask' | 'breaker';

/** The pool of one tribe runs dry at `at` and wakes `asleep` minutes later (ADR 0009). */
export interface ManaOut {
  readonly tribe: string;
  readonly at: number;
  readonly asleep: number;
}

export interface Scenario {
  readonly id: DayId;
  readonly cast: readonly CastMember[];
  readonly territories: readonly TerritorySeed[];
  readonly templates: readonly QuestTemplate[];
  /** How many quests arrive, and when: minutes after the day starts. */
  readonly quests: number;
  readonly arrivals: Range;
  readonly session: Weights<SessionEnd>;
  readonly verdict: Weights<'pass' | 'fail'>;
  readonly script: Weights<'pass' | 'crash'>;
  readonly minutes: {
    readonly work: Range;
    readonly review: Range;
    readonly script: Range;
    /** Before the owner seals, answers or retries: the owner has a life outside the kingdom. */
    readonly owner: Range;
  };
  /** Whether the owner sends a quest back from the infirmary (retry) during the day. */
  readonly ownerRetries: boolean;
  readonly manaOut?: ManaOut;
}
