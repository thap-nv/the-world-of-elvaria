// The files a fake day starts from, built from the scenario's rows and checked by the domain's schemas: the cast
// (with verdicts from earlier days, so avatar rings and titles are not all blank), the territories, and every
// quest as the Steward would write it from the Chancellor's draft (budget from kingdom.breakers, §2.3).
import { CharacterSchema, QuestSchema, RANKS, TerritorySchema, formatDatedId } from '@elvaria/domain';
import type {
  Character,
  Instant,
  Kingdom,
  Quest,
  QuestId,
  Rank,
  Registry,
  Territory,
  ZonedTime,
} from '@elvaria/domain';

import type { Dice } from './dice.ts';
import type { CastMember, QuestTemplate, Scenario, TerritorySeed, Title } from './scenario.ts';

const HOUR_MS = 3_600_000;
/** The cast's past verdicts are spread back from the morning, one every few hours. */
const HISTORY_STEP_HOURS = 5;
const DATED_ID_BYTES = 4;
const DATE_LENGTH = 10;

/** What the Chancellor estimates for a quest of each rank (§2.3 `estimate`). */
const ESTIMATE: Readonly<Record<Rank, { readonly tokens: number; readonly minutes: number }>> = {
  F: { tokens: 40_000, minutes: 15 },
  E: { tokens: 80_000, minutes: 20 },
  D: { tokens: 150_000, minutes: 30 },
  C: { tokens: 250_000, minutes: 40 },
  B: { tokens: 400_000, minutes: 60 },
  A: { tokens: 600_000, minutes: 90 },
  S: { tokens: 900_000, minutes: 120 },
};

export interface Arrival {
  readonly minute: number;
  readonly template: QuestTemplate;
  readonly rank: Rank;
  readonly title: Title;
}

/** The quests of the day, drawn once up front so the day's shape follows the seed alone. */
export function drawArrivals(scenario: Scenario, dice: Dice): Arrival[] {
  const weights = Object.fromEntries(scenario.templates.map((template, index) => [index, template.weight]));
  return Array.from({ length: scenario.quests }, () => {
    const template = scenario.templates[Number(dice.weighted(weights))] ?? scenario.templates[0];
    if (template === undefined) throw new Error(`sandbox: ${scenario.id} has no quest templates`);
    return {
      minute: dice.int(scenario.arrivals),
      template,
      rank: dice.weighted(template.ranks),
      title: dice.pick(template.titles),
    };
  }).toSorted((a, b) => a.minute - b.minute);
}

/** Older verdicts first, failures among the oldest: the rate is the table's, the order makes the day readable. */
function pastVerdicts(member: CastMember, morning: Instant, zoned: ZonedTime, dice: Dice) {
  const { verdicts, pass } = member.history;
  const fails = verdicts - Math.round(verdicts * pass);
  return Array.from({ length: verdicts }, (_, index) => {
    const when = (morning - (verdicts - index) * HISTORY_STEP_HOURS * HOUR_MS) as Instant;
    const quest = formatDatedId('q', zoned.localDate(when), dice.random.bytes(DATED_ID_BYTES));
    const result = index < fails ? ('fail' as const) : ('pass' as const);
    return { verdict_id: `${quest}-1`, result, by_human: false, at: zoned.format(when) };
  });
}

export interface CastContext {
  readonly registry: Registry;
  readonly zoned: ZonedTime;
  readonly dice: Dice;
}

/** A character summoned at `morning` (its line's time), idle, with its past verdicts in every window. */
export function characterOf(member: CastMember, morning: string, context: CastContext): Character {
  const klass = context.registry.classes.find(({ id }) => id === member.cls);
  const window = pastVerdicts(member, Date.parse(morning) as Instant, context.zoned, context.dice);
  return CharacterSchema.parse({
    version: 1,
    id: member.id,
    name: member.id.charAt(0).toUpperCase() + member.id.slice(1),
    class: member.cls,
    tribe: member.tribe,
    model: member.model,
    level: member.level,
    reputation: { window },
    skill_affinity: Object.fromEntries(member.history.tags.map((tag) => [tag, { window }])),
    status: 'idle',
    status_since: morning,
    current: null,
    vow_no_production: klass?.is_verifier === true || klass?.is_monk === true,
    consecutive_fail: { count: 0 },
    stats: { quests_done: 0, tokens_today: 0, tokens_day: morning.slice(0, DATE_LENGTH) },
    created_at: window[0]?.at ?? morning,
  });
}

export const territoryOf = (seed: TerritorySeed): Territory =>
  TerritorySchema.parse({
    version: 1,
    id: seed.id,
    name: seed.name,
    // Never touched: the sandbox spawns nothing and writes only events/sandbox/ (§7).
    path: `/sandbox/${seed.id}`,
    kind: seed.kind,
    vcs: { type: 'git', default_branch: 'main' },
  });

/** The quest file the Steward writes when the Chancellor's draft arrives (§2.3, §3.11). */
export function questOf(arrival: Arrival, id: QuestId, at: string, context: QuestContext): Quest {
  const { template, rank } = arrival;
  const { kingdom, registry, locale } = context;
  const kind = registry.kinds.find(({ id: kindId }) => kindId === template.kind);
  // scenarioProblems has checked every kind before the day starts.
  if (kind === undefined) throw new Error(`sandbox: no kind ${template.kind}`);
  const { breakers } = kingdom;
  const high = RANKS.indexOf(rank) >= RANKS.indexOf(breakers.high_rank_from);
  const estimate = ESTIMATE[rank];
  const title = arrival.title[locale];
  return QuestSchema.parse({
    version: 1,
    id,
    title,
    description:
      locale === 'vi' ? `Việc giả của sa bàn: ${title}.` : `A fake quest of the sandbox: ${title}.`,
    kind: template.kind,
    rank,
    territory: template.territory,
    ...(template.script === undefined
      ? { class_required: template.cls }
      : { script: { id: template.script, params: {} } }),
    tags: template.tags,
    status: 'open',
    tier: template.script === undefined ? 'session' : 'script',
    assignee: null,
    verifier: null,
    budget: {
      max_minutes: high ? breakers.attempt_minutes.high : breakers.attempt_minutes.low,
      max_tokens: Math.round(estimate.tokens * breakers.mana_multiplier),
      max_attempts: breakers.max_attempts,
    },
    estimate,
    attempts: 0,
    attempt_log: [],
    plot: { type: 'none' },
    deliverable: { type: kind.deliverable_type },
    seal_required: kind.seal_default,
    created_by: 'chancellor',
    created_at: at,
    updated_at: at,
  });
}

export interface QuestContext {
  readonly kingdom: Kingdom;
  readonly registry: Registry;
  readonly locale: 'vi' | 'en';
}
