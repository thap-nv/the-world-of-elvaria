// Characters, quests and snapshots for the planTick specs, every file valid by its schema.
import { CharacterSchema } from '../../schema/character/character.ts';
import { KingdomSchema } from '../../schema/kingdom.ts';
import { QuestSchema } from '../../schema/quest/quest.ts';
import kingdomExamples from '../../../examples/kingdom.json' with { type: 'json' };
import type { Instant } from '../../core/clock.ts';
import type { QuestId } from '../../core/ids.ts';
import type { Character } from '../../schema/character/character.ts';
import type { Quest } from '../../schema/quest/quest.ts';
import type { KingdomSnapshot } from '../plan-tick.ts';

/** Minute `m` after 09:00 of the fixture day, as kingdom files store time. */
export const at = (m: number): string =>
  `2026-11-06T${String(9 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00+07:00`;

export const NOW = Date.parse(at(120)) as Instant;

/** The example kingdom: tribes claude and gemini enabled, codex disabled. */
export const KINGDOM = KingdomSchema.parse(kingdomExamples[0]);

interface CharacterSpec {
  readonly cls?: string;
  readonly tribe?: string;
  readonly level?: number;
  readonly status?: 'idle' | 'working' | 'suspended' | 'sleeping_mana';
  /** Minute its status began: the lower, the longer it has been idle. */
  readonly since?: number;
}

export function character(id: string, spec: CharacterSpec = {}): Character {
  const status = spec.status ?? 'idle';
  return CharacterSchema.parse({
    version: 1,
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    class: spec.cls ?? 'knight',
    tribe: spec.tribe ?? 'claude',
    model: spec.tribe === 'gemini' ? 'gemini-4-argon-medium' : 'claude-sonnet-5-5',
    level: spec.level ?? 3,
    reputation: { window: [] },
    status,
    status_since: at(spec.since ?? 0),
    ...(status === 'sleeping_mana' ? { status_before_sleep: 'idle' } : {}),
    current: status === 'working' ? { quest: 'q_20261106_zzzzzz', role: 'assignee' } : null,
    vow_no_production: false,
    consecutive_fail: { count: 0 },
    stats: { quests_done: 0, tokens_today: 0, tokens_day: '2026-11-06' },
    created_at: '2026-11-05T08:00:00+07:00',
  });
}

interface QuestSpec {
  readonly rank?: string;
  readonly cls?: string;
  /** Minute it was created: the lower, the older. */
  readonly created?: number;
  readonly status?: 'open' | 'draft' | 'done';
  readonly script?: boolean;
  readonly dependsOn?: readonly string[];
}

export function quest(id: string, spec: QuestSpec = {}): Quest {
  const script = spec.script === true;
  return QuestSchema.parse({
    version: 1,
    id,
    title: `Quest ${id.slice(-6)}`,
    description: 'A quest of the planTick specs.',
    kind: script ? 'batch' : 'build',
    rank: spec.rank ?? 'D',
    territory: 'dc1-se-team',
    ...(script ? { script: { id: 'link-check', params: {} } } : { class_required: spec.cls ?? 'knight' }),
    tags: ['infra'],
    status: spec.status ?? 'open',
    tier: script ? 'script' : 'session',
    assignee: null,
    verifier: null,
    depends_on: spec.dependsOn ?? [],
    budget: { max_minutes: 45, max_tokens: 400000, max_attempts: 3 },
    estimate: { tokens: 200000, minutes: 30 },
    attempts: 0,
    attempt_log: [],
    plot: { type: 'none' },
    deliverable: { type: 'branch' },
    seal_required: false,
    created_by: 'chancellor',
    created_at: at(spec.created ?? 0),
    updated_at: at(spec.created ?? 0),
  });
}

export const Q1 = 'q_20261106_a1b2c3' as QuestId;
export const Q2 = 'q_20261106_d4e5f6' as QuestId;
export const Q3 = 'q_20261106_g7h8j9' as QuestId;

export const snapshot = (
  quests: readonly Quest[],
  characters: readonly Character[],
  more: Partial<KingdomSnapshot> = {},
): KingdomSnapshot => ({ kingdom: KINGDOM, quests, characters, asleep: [], ...more });
