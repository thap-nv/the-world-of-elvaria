// `elvaria metrics --plan <quest>` and the three numbers the research session asked for (PS-06b): a plan's sub-quests
// against its plan; time in each status, the pass rate by run and the Chancellor's advice in the ledger.
import { EVENT_VERSION, EventSchema, VerdictSchema, questViewOf } from '@elvaria/domain';
import type { Attempt, PlanAccuracy, Quest } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

const DAY = '2026-11-06';
const at = (hour: number, minute = 0) =>
  `${DAY}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`;
const API = 'q_20261106_aaaaa1';
const WEB = 'q_20261106_aaaaa2';

const entry = (n: number, hour: number, tokens: number, role: Attempt['role'] = 'assignee') => ({
  n,
  character: role === 'assignee' ? 'thorn' : 'vesper',
  role,
  started_at: at(hour),
  ended_at: at(hour, 30),
  outcome: 'submitted',
  tokens,
  run_dir: `.runs/x-${n}`,
});

const PLAN = questFixture('archived', QUEST_ID, {
  kind: 'plan',
  class_required: 'mage',
  deliverable: { type: 'subquests' },
  attempts: 1,
  attempt_log: [entry(1, 8, 90_000)],
});

/** Two parts of the plan: the API went past its scope and filed a memo; the page has not begun. */
const part = (id: string, extra: Record<string, unknown>) =>
  questFixture('open', id, {
    parent_id: QUEST_ID,
    created_by: 'council',
    estimate: { tokens: 100_000, minutes: 30 },
    ...extra,
  });

const PARTS = [
  part(API, {
    status: 'archived',
    scope_paths: ['apps/api/**'],
    attempts: 1,
    attempt_log: [entry(1, 9, 150_000), entry(1, 10, 10_000, 'verifier')],
  }),
  part(WEB, { scope_paths: ['apps/web/**'] }),
];

let ulid = 0;
const line = (
  type: string,
  data: Record<string, unknown>,
  ts: string,
  more: Record<string, unknown> = {},
) => {
  ulid += 1;
  return EventSchema.parse({
    v: EVENT_VERSION,
    id: `01JC${String(ulid).padStart(22, '0')}`,
    ts,
    type,
    actor: { kind: 'steward' },
    data,
    ...more,
  });
};

const viewLine = (type: string, quest: Quest, status: Quest['status'], hour: number, minute = 0) =>
  line(type, { quest: { ...questViewOf(quest), status } }, at(hour, minute), { quest: quest.id });

const MEMO = 'm_20261106_aaaaaa';

async function stagePlan(kingdom: string): Promise<void> {
  await plantQuests(kingdom, PLAN, ...PARTS, questFixture('open', OTHER_QUEST_ID));
  const [api] = PARTS as [Quest, Quest];
  await openEventLog(kingdom).append([
    line('agent.tool', { tool: 'write', path: 'apps/api/src/orders.ts' }, at(9, 5), { quest: API }),
    line('agent.tool', { tool: 'write', path: 'docs/api.md' }, at(9, 6), { quest: API }),
    line('memo.filed', { memo: MEMO, kind: 'proposal', from: 'thorn' }, at(9, 30), { quest: API }),
    line('quest.submitted', { quest: questViewOf(api), out_of_scope: ['docs/api.md'] }, at(9, 30), {
      quest: API,
    }),
  ]);
}

describe('elvaria metrics --plan', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const elvaria = (io: TestIo, ...args: string[]) =>
    run(io, 'metrics', ...args, '--kingdom', kingdom, '--locale', 'en');

  it("sets each sub-quest's scope and estimate beside what it did", async () => {
    await stagePlan(kingdom);
    const io = testIo();
    expect(await elvaria(io, '--plan', QUEST_ID)).toBe(0);
    const text = printed(io);
    expect(text).toContain(`Plan ${QUEST_ID}: Thêm script pnpm check (Archived)`);
    expect(text).toContain(
      'Sub-quests: 2, 1 of them begun; 1 changed files outside their scope; memos filed: 1.',
    );
    expect(text).toContain(
      'Estimate: 200000 tokens; first runs: 150000 tokens (150 % of the estimate of the parts begun); every session of the parts: 160000 tokens; the plan quest itself: 90000 tokens.',
    );
    expect(text).toMatch(
      new RegExp(
        `${API}\\s+knight\\s+Archived\\s+1\\s+2\\s+1\\s+100000\\s+150000\\s+150 %\\s+160000\\s+1\\s+0/0/0/0`,
      ),
    );
    expect(text).toMatch(new RegExp(`${WEB}\\s+knight\\s+Open\\s+1\\s+0\\s+—\\s+100000\\s+—\\s+—\\s+0\\s+0`));
    expect(text).toMatch(new RegExp(`${API}\\s+docs/api\\.md`));
    expect(text).toContain("A part's first run is every session of its assignee's first attempt");
  });

  it('prints it as JSON, and says when the plan has no sub-quest yet', async () => {
    await stagePlan(kingdom);
    const io = testIo();
    expect(await elvaria(io, '--plan', QUEST_ID, '--json')).toBe(0);
    const accuracy = JSON.parse(io.printed.out.join('\n')) as PlanAccuracy;
    expect(accuracy.parts.map(({ quest }) => quest)).toEqual([API, WEB]);
    expect(accuracy.totals.outside).toBe(1);
    const another: Quest = { ...PLAN, id: 'q_20261106_aaaaa3' as Quest['id'] };
    await plantQuests(kingdom, another);
    const alone = testIo();
    expect(await elvaria(alone, '--plan', 'q_20261106_aaaaa3')).toBe(0);
    expect(printed(alone)).toContain('No sub-quest yet: the plan is not delivered.');
  });

  it('refuses a quest that is no plan, one that is not there, and a window', async () => {
    await stagePlan(kingdom);
    for (const [args, message] of [
      [
        ['--plan', OTHER_QUEST_ID],
        `${OTHER_QUEST_ID} is no plan quest: it delivers branch, not sub-quests. --plan takes a quest whose kind delivers sub-quests.`,
      ],
      [['--plan', 'q_20261106_nothin'], 'There is no quest q_20261106_nothin.'],
      [
        ['--plan', QUEST_ID, '--since', DAY],
        '--plan reads a plan over its whole life: leave out --since and --until.',
      ],
    ] as const) {
      const io = testIo();
      expect(await elvaria(io, ...args)).toBe(2);
      expect(io.printed.err).toEqual([message]);
    }
  });
});

describe('elvaria metrics: time in each status, pass rate by run, advice (PS-06b)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  it('prints the three, and leaves the advice empty when no memo was sent up', async () => {
    const quest = questFixture('archived', OTHER_QUEST_ID, {
      attempts: 1,
      attempt_log: [entry(1, 8, 1000), entry(1, 9, 1000, 'verifier')],
    });
    await plantQuests(kingdom, quest);
    await openKingdom(kingdom).verdicts.write(
      VerdictSchema.parse({
        version: 1,
        id: `${OTHER_QUEST_ID}-1`,
        quest_id: OTHER_QUEST_ID,
        attempt: 1,
        verifier_id: 'vesper',
        ritual: 'build_review',
        checks: [],
        result: 'pass',
        by_human: false,
        session_id: 's-judge',
        created_at: at(9, 30),
      }),
    );
    const judged: Quest = { ...quest, verifier: 'vesper' as Quest['verifier'] };
    await openEventLog(kingdom).append([
      viewLine('quest.submitted', quest, 'review', 8, 30),
      viewLine('quest.started', judged, 'review', 8, 45),
      viewLine('quest.done', quest, 'done', 9, 30),
    ]);
    const io = testIo();
    expect(await run(io, 'metrics', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    const text = printed(io);
    expect(text).toMatch(/In review, no judge yet\s+1\s+15\.0\s+15\.0/);
    expect(text).toMatch(/In review, its judge at work\s+1\s+45\.0\s+45\.0/);
    expect(text).toMatch(/Pass rate by run\n.*\n1\s+1\s+1\s+100 %/);
    expect(text).toMatch(/The Chancellor's advice on the memos sent up to you\nNone\./);
    await openEventLog(kingdom).append([
      line('memo.escalated', { memo: MEMO, action: 'shelve', holds: ['above_rank'] }, at(10)),
      line('memo.closed', { memo: MEMO, decision: 'shelved' }, at(11), { actor: { kind: 'user' } }),
    ]);
    const again = testIo();
    expect(await run(again, 'metrics', '--kingdom', kingdom, '--locale', 'vi')).toBe(0);
    expect(printed(again)).toContain(
      'Làm theo lời khuyên: 1 trên 1 thư chủ nhân đã quyết sau một lời khuyên (100 %); thư đưa lên: 1.',
    );
    expect(printed(again)).toMatch(/shelve\s+1\s+1\s+1/);
  });
});
