import { describe, expect, it } from 'vitest';

import { at, lineOf, questId, questOf, verdictOf } from './__fixtures__/ledger.ts';
import { planAccuracyOf } from './plan-accuracy.ts';
import type { MetricsInput } from './ledger.ts';
import type { Event } from '../schema/event/event.ts';
import type { Quest } from '../schema/quest/quest.ts';

const PLAN = questId(10);
const [API, WEB, DOCS] = [questId(11), questId(12), questId(13)];

/** A quest of the plan's tree: its parent, who made it, its scope and estimate. */
const child = (quest: Quest, fields: Partial<Quest>): Quest => ({
  ...quest,
  created_by: 'council',
  parent_id: PLAN,
  ...fields,
});

const plan: Quest = {
  ...questOf(
    10,
    [
      { n: 1, character: 'merle', start: 0, end: 20, tokens: 120_000 },
      { n: 1, role: 'verifier', start: 20, end: 25, tokens: 30_000 },
    ],
    { kind: 'plan', class: 'mage', status: 'archived' },
  ),
  deliverable: { type: 'subquests' },
};

/**
 * Three parts. The API: its first run failed (tests), the second passed; it edited a file outside its scope and filed
 * a proposal. The page: the mana paused its first run, which then passed. The docs: a child of the page, not begun.
 * The Steward's merge quest, a follow-up of the API and a quest outside the plan are no parts.
 */
const QUESTS: readonly Quest[] = [
  plan,
  child(
    questOf(11, [
      { n: 1, start: 30, end: 35, tokens: 150_000, session: 'api-1' },
      { n: 1, role: 'verifier', start: 35, end: 36, tokens: 20_000, session: 'api-1v' },
      { n: 2, start: 40, end: 42, tokens: 50_000 },
      { n: 2, role: 'verifier', start: 42, end: 43, tokens: 10_000 },
    ]),
    {
      title: 'The export endpoint',
      scope_paths: ['apps/api/**'],
      estimate: { tokens: 200_000, minutes: 30 },
    },
  ),
  child(
    questOf(12, [
      { n: 1, outcome: 'paused', start: 30, end: 40, tokens: 40_000 },
      { n: 1, start: 50, end: 60, tokens: 30_000 },
      { n: 1, role: 'verifier', start: 60, end: 61, tokens: 5_000 },
    ]),
    { scope_paths: ['apps/web/**'], estimate: { tokens: 100_000, minutes: 20 }, created_at: at(1) },
  ),
  child(questOf(13, [], { kind: 'document', class: 'scribe', status: 'open' }), {
    parent_id: WEB,
    scope_paths: ['docs/orders.md'],
    estimate: { tokens: 50_000, minutes: 10 },
  }),
  child(questOf(14, []), { party_role: 'merge' }),
  child(questOf(15, []), { parent_id: API, created_by: 'battle' }),
  questOf(16, []),
];

const write = (path: string, quest: string, session?: string): Event => ({
  ...lineOf('agent.tool', { tool: 'write', path }, at(33), quest),
  ...(session === undefined ? {} : { session }),
});

const submitted = (quest: string, minute: number, outside?: readonly string[]): Event =>
  lineOf(
    'quest.submitted',
    { quest: {}, ...(outside === undefined ? {} : { out_of_scope: outside }) },
    at(minute),
    quest,
  );

const EVENTS: readonly Event[] = [
  write('apps/api/src/orders.ts', API, 'api-1'),
  write('docs/api.md', API, 'api-1'),
  write('apps/api/src/orders.ts', API, 'api-1'),
  write('apps/api/scratch.spec.ts', API, 'api-1v'),
  lineOf('agent.tool', { tool: 'read', path: 'apps/api/src/index.ts' }, at(33), API),
  lineOf('agent.tool', { tool: 'write' }, at(33), API),
  submitted(API, 35, ['docs/api.md', 'apps/web/src/a.ts']),
  lineOf('memo.filed', { memo: 'm_20261108_aaaaaa', kind: 'proposal', from: 'thorn' }, at(35), API),
  submitted(API, 42, ['docs/api.md']),
  write('apps/web/src/orders.tsx', WEB),
  submitted(WEB, 60),
  write('apps/other.ts', questId(16)),
  lineOf('check.end', { outcome: 'pass', checks: [] }, at(61)),
];

const INPUT: MetricsInput = {
  quests: QUESTS,
  verdicts: [
    verdictOf(11, 1, 'fail', { fail_kind: 'tests_fail', minute: 36 }),
    verdictOf(11, 2, 'pass', { minute: 43 }),
    verdictOf(12, 1, 'pass', { minute: 61 }),
  ],
  events: EVENTS,
  commands: [],
};

const NO_REWORK = { infra: 0, output: 0, question: 0, unknown: 0 };

describe('planAccuracyOf (PS-06b)', () => {
  const accuracy = planAccuracyOf(INPUT, PLAN);
  if (!accuracy.ok) throw new Error('the plan is a plan');
  const { parts, totals } = accuracy.value;

  it("lists the mage's parts in the order they were made, the Steward's quests and those outside aside", () => {
    expect(accuracy.value.plan).toEqual({ id: PLAN, title: 'Quest 10', status: 'archived', tokens: 150_000 });
    expect(parts.map(({ quest }) => quest)).toEqual([API, DOCS, WEB]);
  });

  it('sets the scope beside the files edited and those changed outside it, the estimate beside the first run', () => {
    expect(parts[0]).toEqual({
      quest: API,
      title: 'The export endpoint',
      kind: 'build',
      rank: 'E',
      class: 'knight',
      status: 'archived',
      scope: ['apps/api/**'],
      written: ['apps/api/src/orders.ts', 'docs/api.md'],
      submitted: true,
      out_of_scope: ['docs/api.md'],
      estimate: { tokens: 200_000, minutes: 30 },
      first_run: { tokens: 150_000, minutes: 5 },
      tokens: 230_000,
      memos: { proposal: 1 },
      rework: { ...NO_REWORK, output: 2 },
    });
    expect(parts[2]).toMatchObject({
      written: ['apps/web/src/orders.tsx'],
      submitted: true,
      out_of_scope: [],
      first_run: { tokens: 70_000, minutes: 20 },
      tokens: 75_000,
      memos: {},
      rework: NO_REWORK,
    });
    expect(parts[1]).toMatchObject({
      class: 'scribe',
      status: 'open',
      written: [],
      submitted: false,
      first_run: null,
      tokens: 0,
      rework: NO_REWORK,
    });
  });

  it('adds the parts up', () => {
    expect(totals).toEqual({
      estimate: { tokens: 350_000, minutes: 60 },
      first_run: { tokens: 220_000, minutes: 25 },
      tokens: 305_000,
      memos: 1,
      rework: { ...NO_REWORK, output: 2 },
      outside: 1,
    });
  });

  it('refuses a quest that is not there, and one that delivers no sub-quests', () => {
    expect(planAccuracyOf(INPUT, 'q_20261108_nothing')).toEqual({
      ok: false,
      error: { code: 'unknown_quest', quest: 'q_20261108_nothing' },
    });
    expect(planAccuracyOf(INPUT, API)).toEqual({
      ok: false,
      error: { code: 'not_a_plan', quest: API, deliverable: 'branch' },
    });
  });

  it('counts a first run still open, and a script part with no class and no scope', () => {
    const running = child(questOf(17, [{ n: 1, start: 30 }]), {});
    const script = child(questOf(18, [], { tier: 'script' }), {});
    const both = planAccuracyOf({ ...INPUT, quests: [plan, running, script] }, PLAN);
    expect(both.ok && both.value.parts).toEqual([
      expect.objectContaining({ first_run: { tokens: 0, minutes: 0 }, class: 'knight', scope: [] }),
      expect.objectContaining({ first_run: null, class: null, scope: [] }),
    ]);
  });

  it('has no parts before the plan is delivered', () => {
    const alone = planAccuracyOf({ ...INPUT, quests: [plan] }, PLAN);
    expect(alone.ok && alone.value.parts).toEqual([]);
    expect(alone.ok && alone.value.totals.first_run).toEqual({ tokens: 0, minutes: 0 });
  });
});
