// Characters, quests and snapshots for the dispatch specs, every file valid by its schema. Quests past `open` are
// moved there by transition(), so they hold what the state machine would have written.
import { CharacterSchema } from '../../schema/character/character.ts';
import { KingdomSchema } from '../../schema/kingdom.ts';
import { QuestSchema } from '../../schema/quest/quest.ts';
import { transition } from '../../quest/transition.ts';
import { FULL_TRIBE_LIMITS } from '../../tribe/tribe-limits.ts';
import kingdomExamples from '../../../examples/kingdom.json' with { type: 'json' };
import type { Instant } from '../../core/clock.ts';
import type { QuestId, TagId, TerritoryId, TribeId } from '../../core/ids.ts';
import type { QuestActor, QuestEvent } from '../../quest/events.ts';
import type { Character } from '../../schema/character/character.ts';
import type { Quest } from '../../schema/quest/quest.ts';
import type { KingdomSnapshot } from '../plan-tick.ts';
import type { TerritoryRules } from '../roster.ts';

/** Minute `m` after 09:00 of the fixture day, as kingdom files store time. */
export const at = (m: number): string =>
  `2026-11-06T${String(9 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00+07:00`;

export const NOW = Date.parse(at(120)) as Instant;

/** The example kingdom: tribes claude (2 sessions) and gemini (1) enabled, codex disabled. */
export const KINGDOM = KingdomSchema.parse(kingdomExamples[0]);

export const TERRITORY = 'dc1-se-team' as TerritoryId;
export const DOCS = 'handbook' as TerritoryId;

const NO_LAWS: TerritoryRules['laws'] = {
  forbidden_paths: [],
  read_only_paths: [],
  patch_paths: [],
  forbidden_commands: [],
  read_before_write: [],
  rank_floor: [],
};

export const territory = (id: string, maxConcurrent = 9, laws = NO_LAWS): TerritoryRules => ({
  id: id as TerritoryId,
  max_concurrent: maxConcurrent,
  laws,
});

/** read_before_write makes a territory guarded for tribes without a tool gate (§3.14). */
export const GUARDED_LAWS = { ...NO_LAWS, read_before_write: ['packages/shared/src/auth/**'] };
export const FLOOR_LAWS = { ...NO_LAWS, rank_floor: [{ glob: 'apps/api/**', min_rank: 'B' as const }] };

export const CLASSES = [
  { id: 'knight', is_verifier: false, kinds: ['build'] },
  { id: 'dwarf', is_verifier: false, kinds: ['build'] },
  { id: 'scribe', is_verifier: false, kinds: ['document'] },
  { id: 'judge', is_verifier: true, kinds: ['build', 'document'] },
] as unknown as KingdomSnapshot['registry']['classes'];

interface CharacterSpec {
  readonly cls?: string;
  readonly tribe?: string;
  readonly model?: string;
  readonly level?: number;
  readonly status?: 'idle' | 'working' | 'reviewing' | 'suspended' | 'sleeping_mana';
  /** Minute its status began: the lower, the longer it has been idle. */
  readonly since?: number;
  readonly pinned?: string;
  /** Verdicts on a tag: `{ frontend: ['pass', 'fail'] }`. */
  readonly affinity?: Readonly<Record<string, readonly ('pass' | 'fail')[]>>;
  /** Its fail streak (consecutive_fail): none by default. */
  readonly fails?: { readonly fail_kind: 'tests_fail' | 'style'; readonly count: number };
}

const windowOf = (results: readonly ('pass' | 'fail')[]) =>
  results.map((result, index) => ({
    verdict_id: `q_20261105_aaaaa${String(index)}-1`,
    result,
    by_human: false,
    at: '2026-11-05T10:00:00+07:00',
  }));

export function character(id: string, spec: CharacterSpec = {}): Character {
  const status = spec.status ?? 'idle';
  const holding = status === 'working' || status === 'reviewing';
  return CharacterSchema.parse({
    version: 1,
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    class: spec.cls ?? 'knight',
    tribe: spec.tribe ?? 'claude',
    model: spec.model ?? (spec.tribe === 'gemini' ? 'gemini-4-argon-medium' : 'claude-sonnet-5-5'),
    level: spec.level ?? 3,
    reputation: { window: [] },
    skill_affinity: Object.fromEntries(
      Object.entries(spec.affinity ?? {}).map(([tag, results]) => [tag, { window: windowOf(results) }]),
    ),
    pinned_tag: spec.pinned ?? null,
    status,
    status_since: at(spec.since ?? 0),
    ...(status === 'sleeping_mana' ? { status_before_sleep: 'idle' } : {}),
    current: holding
      ? { quest: 'q_20261106_zzzzzz', role: status === 'working' ? 'assignee' : 'verifier' }
      : null,
    vow_no_production: false,
    consecutive_fail: spec.fails ?? { count: 0 },
    stats: { quests_done: 0, tokens_today: 0, tokens_day: '2026-11-06' },
    created_at: '2026-11-05T08:00:00+07:00',
  });
}

interface QuestSpec {
  readonly rank?: string;
  readonly cls?: string;
  readonly kind?: string;
  readonly territory?: string;
  readonly tags?: readonly string[];
  /** Minute it was created: the lower, the older. */
  readonly created?: number;
  readonly status?: 'open' | 'draft' | 'done';
  readonly script?: boolean;
  readonly dependsOn?: readonly string[];
  /** The party (id of its contract quest) the quest belongs to; the contract when it names itself. */
  readonly party?: string;
  /** Its scope_paths (PS-05); none by default. */
  readonly scope?: readonly string[];
}

export function quest(id: string, spec: QuestSpec = {}): Quest {
  const script = spec.script === true;
  return QuestSchema.parse({
    version: 1,
    id,
    title: `Quest ${id.slice(-6)}`,
    description: 'A quest of the dispatch specs.',
    kind: script ? 'batch' : (spec.kind ?? 'build'),
    rank: spec.rank ?? 'D',
    territory: spec.territory ?? TERRITORY,
    ...(script ? { script: { id: 'link-check', params: {} } } : { class_required: spec.cls ?? 'knight' }),
    tags: spec.tags ?? ['infra'],
    status: spec.status ?? 'open',
    tier: script ? 'script' : 'session',
    assignee: null,
    verifier: null,
    depends_on: spec.dependsOn ?? [],
    ...(spec.scope === undefined ? {} : { scope_paths: spec.scope }),
    ...(spec.party === undefined
      ? {}
      : spec.party === id
        ? { party_id: spec.party, party_role: 'contract' }
        : { party_id: spec.party, party_role: 'part', contract: 'api/openapi.yaml' }),
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

type Move = readonly [QuestEvent['type'], QuestActor, Record<string, unknown>?];

/** `before` after `moves`, at minute `minute` each; a refused move is a broken fixture. */
export function moved(before: Quest, minute: number, ...moves: readonly Move[]): Quest {
  return moves.reduce((current, [type, actor, extra]) => {
    const event = { type, at: at(minute), ...extra } as QuestEvent;
    const result = transition(current, event, actor);
    if (!result.ok) throw new Error(`fixture: ${type} refused: ${JSON.stringify(result.error)}`);
    return result.value;
  }, before);
}

/** A quest claimed by `assignee` (level 3) at minute `minute`. */
export const claimedBy = (base: Quest, assignee: string, minute = 10): Quest =>
  moved(base, minute, ['claim', 'steward', { assignee, level: 3 }]);

/** A quest whose assignee started its session at minute `minute`. */
export const workingBy = (base: Quest, assignee: string, minute = 10): Quest =>
  moved(claimedBy(base, assignee, minute), minute, ['start', 'steward']);

export const inReview = (base: Quest, assignee: string, minute = 10): Quest =>
  moved(workingBy(base, assignee, minute), minute, ['submit', 'runner']);

export const returnedTo = (base: Quest, assignee: string, minute = 10): Quest =>
  moved(workingBy(base, assignee, minute), minute, ['crash', 'steward']);

export const Q1 = 'q_20261106_a1b2c3' as QuestId;
export const Q2 = 'q_20261106_d4e5f6' as QuestId;
export const Q3 = 'q_20261106_g7h8j9' as QuestId;
export const Q4 = 'q_20261106_k1m2n3' as QuestId;

export const TAG = (id: string): TagId => id as TagId;

const LIMITS = { claude: FULL_TRIBE_LIMITS, gemini: FULL_TRIBE_LIMITS } as Partial<
  Record<TribeId, typeof FULL_TRIBE_LIMITS>
>;

export const snapshot = (
  quests: readonly Quest[],
  characters: readonly Character[],
  more: Partial<KingdomSnapshot> = {},
): KingdomSnapshot => ({
  kingdom: KINGDOM,
  territories: [territory(TERRITORY), territory(DOCS)],
  registry: { classes: CLASSES },
  quests,
  characters,
  asleep: [],
  limits: LIMITS,
  ...more,
});
