// How well a plan foresaw its work (implementation-plan §3.16.1, §3.16.6; PS-06b, `elvaria metrics --plan <quest>`):
// for each sub-quest the mage drafted, the scope it was given beside the files its sessions edited and those its last
// submit changed outside it (PS-05), its estimate beside the tokens and minutes its first run took, the memos its
// sessions filed (PS-02) and its rework by cause. Read from the quest files and the log like the ledger, so a plan is
// measured while its parts still run. The merge quest and the blind trial's part are the Steward's, not the mage's
// (P1-18, P1-21): the plan never sized them, so they are no part of it here.
import { MS_PER_MINUTE } from '../constants.ts';
import { err, ok } from '../core/result.ts';
import { isEventOf } from '../schema/event/event.ts';
import { REWORK_CAUSES } from './causes.ts';
import { trailsOf } from './ledger.ts';
import { reworkOf } from './rework.ts';
import { sessionRolesOf } from './session-counts.ts';
import type { ReworkCause } from './causes.ts';
import type { MetricsInput } from './ledger.ts';
import type { ClassId, KindId, QuestId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { Rank } from '../schema/common.ts';
import type { Event } from '../schema/event/event.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { QuestStatus } from '../schema/quest/shared.ts';

/** Tokens and minutes: an estimate, or what sessions took. */
export interface PartCost {
  readonly tokens: number;
  readonly minutes: number;
}

export interface PlanPart {
  readonly quest: QuestId;
  readonly title: string;
  readonly kind: KindId;
  readonly rank: Rank;
  readonly class: ClassId | null;
  readonly status: QuestStatus;
  /** The globs the plan gave it (`scope_paths`); none for a script. */
  readonly scope: readonly string[];
  /** Files its sessions edited, from the hook's `agent.tool` lines: an edit made through a shell is not seen. */
  readonly written: readonly string[];
  /** Whether its work was ever handed in; until then nothing says what it changed outside its scope. */
  readonly submitted: boolean;
  /** Files its last submit changed outside its scope, the territory's shared paths aside (PS-05). */
  readonly out_of_scope: readonly string[];
  readonly estimate: PartCost;
  /** What the assignee's first run took, every session of it (a question, the mana); null before it starts. */
  readonly first_run: PartCost | null;
  /** Every session's tokens, judges and rework included. */
  readonly tokens: number;
  /** Memos its sessions filed, by kind (PS-02). */
  readonly memos: Readonly<Record<string, number>>;
  readonly rework: Readonly<Record<ReworkCause, number>>;
}

export interface PlanTotals {
  readonly estimate: PartCost;
  /** Over the parts whose first run started. */
  readonly first_run: PartCost;
  readonly tokens: number;
  readonly memos: number;
  readonly rework: Readonly<Record<ReworkCause, number>>;
  /** Parts whose last submit changed files outside their scope. */
  readonly outside: number;
}

export interface PlanAccuracy {
  readonly plan: Pick<Quest, 'id' | 'title' | 'status'> & { readonly tokens: number };
  /** The mage's sub-quests, children of the plan or of another part, in the order they were made; none before delivery. */
  readonly parts: readonly PlanPart[];
  readonly totals: PlanTotals;
}

export type PlanAccuracyError =
  | { readonly code: 'unknown_quest'; readonly quest: string }
  /** The quest delivers no sub-quests: it is no plan. */
  | {
      readonly code: 'not_a_plan';
      readonly quest: QuestId;
      readonly deliverable: Quest['deliverable']['type'];
    };

const STEWARD_ROLES: ReadonlySet<Quest['party_role']> = new Set(['merge', 'acceptance']);

/** The mage's sub-quests under `plan`, through parts that are children of parts (parent_ref). */
function partsOf(plan: QuestId, quests: readonly Quest[]): Quest[] {
  const parts: Quest[] = [];
  // Ids as strings, so a quest without a parent looks up '' and finds none.
  const parents = new Set<string>([plan]);
  for (let found = true; found;) {
    const more = quests.filter(
      (quest) =>
        parents.has(quest.parent_id ?? '') &&
        !parents.has(quest.id) &&
        quest.created_by === 'council' &&
        !STEWARD_ROLES.has(quest.party_role),
    );
    for (const quest of more) parents.add(quest.id);
    parts.push(...more);
    found = more.length > 0;
  }
  return parts.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

const tokensOf = (quest: Quest): number =>
  quest.attempt_log.reduce((total, { tokens }) => total + (tokens ?? 0), 0);

/** Every session of the assignee's first run, the mana's pauses included: what the estimate sized. */
function firstRunOf(quest: Quest): PartCost | null {
  const first = quest.attempt_log.find(({ role, character }) => role === 'assignee' && character !== null);
  if (first === undefined) return null;
  const run = quest.attempt_log.filter(({ role, n }) => role === 'assignee' && n === first.n);
  const ms = run.reduce(
    (total, { started_at, ended_at }) =>
      ended_at === undefined ? total : total + Date.parse(ended_at) - Date.parse(started_at),
    0,
  );
  return { tokens: tokensOf({ ...quest, attempt_log: run }), minutes: ms / MS_PER_MINUTE };
}

/** What the log says of one part: the files edited, its last submit, its memos. */
interface PartLines {
  readonly written: Set<string>;
  submitted: boolean;
  out_of_scope: readonly string[];
  readonly memos: Record<string, number>;
}

function linesOf(
  events: readonly Event[],
  parts: ReadonlySet<string>,
  quests: readonly Quest[],
): ReadonlyMap<string, PartLines> {
  const roles = sessionRolesOf(quests);
  const lines = new Map<string, PartLines>();
  const of = (quest: string): PartLines => {
    const found = lines.get(quest) ?? { written: new Set(), submitted: false, out_of_scope: [], memos: {} };
    lines.set(quest, found);
    return found;
  };
  for (const event of events) {
    if (event.quest === undefined || !parts.has(event.quest)) continue;
    const part = of(event.quest);
    if (isEventOf(event, 'agent.tool') && event.data.tool === 'write' && event.data.path !== undefined) {
      // A judge in a scratch plot (ADR 0022) writes there, not in the part's work.
      if (event.session === undefined || roles.get(event.session) !== 'verifier')
        part.written.add(event.data.path);
    } else if (isEventOf(event, 'quest.submitted')) {
      part.submitted = true;
      part.out_of_scope = event.data.out_of_scope ?? [];
    } else if (isEventOf(event, 'memo.filed'))
      part.memos[event.data.kind] = (part.memos[event.data.kind] ?? 0) + 1;
  }
  return lines;
}

const NO_LINES: PartLines = { written: new Set(), submitted: false, out_of_scope: [], memos: {} };

const causesOf = (counts: readonly ReworkCause[]): Record<ReworkCause, number> =>
  Object.fromEntries(
    REWORK_CAUSES.map((cause) => [cause, counts.filter((entry) => entry === cause).length]),
  ) as Record<ReworkCause, number>;

const sum = <T>(items: readonly T[], of: (item: T) => number): number =>
  items.reduce((total, item) => total + of(item), 0);

function totalsOf(parts: readonly PlanPart[]): PlanTotals {
  const started = parts.flatMap(({ first_run: run }) => (run === null ? [] : [run]));
  return {
    estimate: {
      tokens: sum(parts, (part) => part.estimate.tokens),
      minutes: sum(parts, (part) => part.estimate.minutes),
    },
    first_run: { tokens: sum(started, (run) => run.tokens), minutes: sum(started, (run) => run.minutes) },
    tokens: sum(parts, (part) => part.tokens),
    memos: sum(parts, (part) => sum(Object.values(part.memos), (count) => count)),
    rework: Object.fromEntries(
      REWORK_CAUSES.map((cause) => [cause, sum(parts, (part) => part.rework[cause])]),
    ) as Record<ReworkCause, number>,
    outside: parts.filter((part) => part.out_of_scope.length > 0).length,
  };
}

/** The plan quest `id` beside what its sub-quests did; an error for a quest that is not there or is no plan. */
export function planAccuracyOf(input: MetricsInput, id: string): Result<PlanAccuracy, PlanAccuracyError> {
  const plan = input.quests.find((quest) => quest.id === id);
  if (plan === undefined) return err({ code: 'unknown_quest', quest: id });
  if (plan.deliverable.type !== 'subquests')
    return err({ code: 'not_a_plan', quest: plan.id, deliverable: plan.deliverable.type });
  const quests = partsOf(plan.id, input.quests);
  const lines = linesOf(input.events, new Set(quests.map(({ id: quest }) => quest)), input.quests);
  const parts = trailsOf({ ...input, quests }).map((trail): PlanPart => {
    const { quest } = trail;
    const seen = lines.get(quest.id) ?? NO_LINES;
    return {
      quest: quest.id,
      title: quest.title,
      kind: quest.kind,
      rank: quest.rank,
      class: quest.class_required ?? null,
      status: quest.status,
      scope: quest.scope_paths ?? [],
      written: [...seen.written].sort(),
      submitted: seen.submitted,
      out_of_scope: seen.out_of_scope,
      estimate: quest.estimate,
      first_run: firstRunOf(quest),
      tokens: tokensOf(quest),
      memos: { ...seen.memos },
      rework: causesOf(reworkOf(trail).map(({ cause }) => cause)),
    };
  });
  const { id: planId, title, status } = plan;
  return ok({ plan: { id: planId, title, status, tokens: tokensOf(plan) }, parts, totals: totalsOf(parts) });
}
