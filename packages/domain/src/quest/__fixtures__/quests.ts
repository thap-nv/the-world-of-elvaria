// Quests and events for the state-machine specs. Every quest here is reached through transition() itself from a
// draft, so the specs test the machine on states it really produces, not on hand-made ones.
import { reviewBreaksOf } from '../../breaker/review.ts';
import { machineMergeDue } from '../../party/machine-merge.ts';
import { QuestSchema } from '../../schema/quest/quest.ts';
import { QUEST_ACTORS, QUEST_EVENT_TYPES } from '../events.ts';
import { findTransition, transition } from '../transition.ts';
import type { CharacterId } from '../../core/ids.ts';
import type { Quest } from '../../schema/quest/quest.ts';
import type { QuestStatus, Tier } from '../../schema/quest/shared.ts';
import type { QuestActor, QuestEvent, QuestEventOf, QuestEventType } from '../events.ts';

export const QUEST_ID = 'q_20261106_7k3m2a';
export const THORN = 'thorn' as CharacterId;
export const BRANN = 'brann' as CharacterId;
export const ELLA = 'ella' as CharacterId;

export interface Variant {
  readonly tier: Tier;
  readonly seal_required: boolean;
  readonly max_attempts: number;
  /** A party's merge quest, whose first run the machine makes (P1-18 (h)). */
  readonly merge?: boolean;
}

export const SESSION: Variant = { tier: 'session', seal_required: false, max_attempts: 3 };
export const SCRIPT: Variant = { tier: 'script', seal_required: false, max_attempts: 1 };
export const MERGE: Variant = { tier: 'session', seal_required: true, max_attempts: 3, merge: true };

/** Every combination the guards read: tier, seal, a budget of one attempt or three; and a party's merge quest. */
export const VARIANTS: readonly Variant[] = [
  ...(['session', 'script'] as const).flatMap((tier) =>
    [false, true].flatMap((seal_required) =>
      [1, 3].map((max_attempts) => ({ tier, seal_required, max_attempts })),
    ),
  ),
  MERGE,
];

/** The contract quest a merge variant belongs to. */
const PARTY_ID = 'q_20261106_5m2k8p';

/** Minute `m` of the test day, as quest.json stores time. */
export const at = (m: number): string =>
  `2026-11-06T${String(9 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00+07:00`;

export function draftQuest(variant: Variant = SESSION): Quest {
  return QuestSchema.parse({
    version: 1,
    id: QUEST_ID,
    title: 'Thêm script pnpm check',
    description: 'Thêm script `pnpm check` và cập nhật README.',
    kind: 'build',
    rank: 'D',
    territory: 'dc1-se-team',
    ...(variant.tier === 'session'
      ? { class_required: 'knight' }
      : { script: { id: 'run-check', params: { check: 'unit' } } }),
    tags: ['infra'],
    ...(variant.merge === true
      ? { party_id: PARTY_ID, party_role: 'merge', contract: 'apps/api/openapi.yaml' }
      : {}),
    status: 'draft',
    tier: variant.tier,
    assignee: null,
    verifier: null,
    budget: { max_minutes: 45, max_tokens: 400000, max_attempts: variant.max_attempts },
    estimate: { tokens: 200000, minutes: 30 },
    attempts: 0,
    attempt_log: [],
    plot: { type: 'none' },
    deliverable: { type: 'branch' },
    seal_required: variant.seal_required,
    created_by: 'chancellor',
    created_at: at(0),
    updated_at: at(0),
  });
}

// Distributive, so a claim keeps both shapes (a character with its level, or nobody).
type Payload<T extends QuestEventType> =
  QuestEventOf<T> extends infer E ? (E extends unknown ? Omit<E, 'type' | 'at'> : never) : never;

/** The level of every character in the fixtures: its ceiling is D, the rank of the fixture quest. */
export const LEVEL = 3;

/** A payload the quest can take: claim names a character only for a session-tier quest. */
export function payloadOf<T extends QuestEventType>(type: T, quest: Quest): Payload<T> {
  const payloads: { readonly [K in QuestEventType]: Payload<K> } = {
    confirm: {},
    discard: {},
    release: {},
    unblock: {},
    return: {},
    reject: {},
    deliver: {},
    archive: {},
    retry: {},
    submit: { session_id: 's-submit', tokens: 1200 },
    mana_out: {},
    crash: {},
    cancel: {},
    suspend: {},
    verdict_pass: {},
    verdict_fail: {},
    start: { session_id: 's-start' },
    redispatch: {},
    mana_restored: {},
    // Nobody takes a script, nor the first run of a merge quest: the machine makes it (P1-18 (h)).
    claim:
      quest.tier === 'session' && !machineMergeDue(quest)
        ? { assignee: THORN, level: LEVEL }
        : { assignee: null },
    reassign: { assignee: ELLA, level: LEVEL },
    block: { question: 'Bản EN dùng giọng nào?' },
    ask: { question: 'Giữ API cũ không?' },
    breaker: { trip: 'tokens' },
    answer: { answer: 'Giữ, đánh dấu deprecated.' },
    assign_verifier: { verifier: BRANN, session_id: 's-verify' },
    seal: { note: 'ok' },
  };
  return payloads[type];
}

export const eventOf = <T extends QuestEventType>(type: T, quest: Quest, when: string): QuestEvent =>
  // payloadOf(type) is the payload of exactly this event type.
  ({ ...payloadOf(type, quest), type, at: when }) as QuestEvent;

/** The actor that may cause `type` now: the row's first, skipping the verifier when none holds the quest. */
export function actorOf(quest: Quest, type: QuestEventType): QuestActor {
  const row = findTransition(quest, type);
  if (!row.ok) throw new Error(`${quest.status} takes no ${type}: ${row.error.code}`);
  return row.value.actors.find((actor) => actor !== 'verifier' || typeof quest.verifier === 'string')!;
}

/** Applies `types` in order with the default payload and actor; throws on the first refusal. */
export function walk(quest: Quest, types: readonly QuestEventType[]): Quest {
  return types.reduce((current, type, index) => {
    const result = transition(current, eventOf(type, current, at(index + 1)), actorOf(current, type));
    if (!result.ok) throw new Error(`${current.status} -> ${type}: ${JSON.stringify(result.error)}`);
    return result.value;
  }, quest);
}

/** A path from draft into each status (session tier; the script tier skips what needs a character). */
export const PATHS: Readonly<Record<QuestStatus, readonly QuestEventType[]>> = {
  draft: [],
  open: ['confirm'],
  claimed: ['confirm', 'claim'],
  working: ['confirm', 'claim', 'start'],
  review: ['confirm', 'claim', 'start', 'submit'],
  returned: ['confirm', 'claim', 'start', 'crash'],
  awaiting_seal: ['confirm', 'claim', 'start', 'submit', 'verdict_pass'],
  done: ['confirm', 'claim', 'start', 'submit', 'verdict_pass'],
  blocked: ['confirm', 'block'],
  paused_mana: ['confirm', 'claim', 'start', 'mana_out'],
  infirmary: ['confirm', 'claim', 'start', 'breaker'],
  archived: ['confirm', 'cancel'],
};

export const questIn = (status: QuestStatus, variant: Variant = SESSION): Quest =>
  walk(draftQuest(variant), PATHS[status]);

/** The fields guards and effects read; two quests alike in these behave alike. */
const keyOf = (quest: Quest): string =>
  JSON.stringify([
    quest.status,
    quest.tier,
    quest.party_role,
    quest.seal_required,
    quest.budget.max_attempts,
    quest.attempts,
    quest.assignee,
    quest.verifier,
    quest.blocked !== undefined,
    quest.seal !== undefined,
    quest.deliverable.delivered_at !== undefined,
    // The stalled_review guards read it (P1-26).
    reviewBreaksOf(quest),
  ]);

/**
 * Every quest the machine reaches from the drafts of VARIANTS in at most `depth` events, trying every event type
 * with its default payload and every actor: the state space the property specs walk.
 */
export function reachable(depth: number): Quest[] {
  const seen = new Map(VARIANTS.map((variant) => [keyOf(draftQuest(variant)), draftQuest(variant)]));
  let frontier = [...seen.values()];
  for (let step = 1; step <= depth; step += 1) {
    const next: Quest[] = [];
    for (const quest of frontier) {
      for (const type of QUEST_EVENT_TYPES) {
        for (const actor of QUEST_ACTORS) {
          const result = transition(quest, eventOf(type, quest, at(step)), actor);
          if (result.ok && !seen.has(keyOf(result.value))) {
            seen.set(keyOf(result.value), result.value);
            next.push(result.value);
          }
        }
      }
    }
    frontier = next;
  }
  return [...seen.values()];
}

/** mulberry32: a seeded generator, so a failing walk replays exactly. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
