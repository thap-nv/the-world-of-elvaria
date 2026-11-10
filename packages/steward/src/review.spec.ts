import { afterEach, describe, expect, it } from 'vitest';

import { KINGDOM, PASS, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { plotsWith, questOfRun, statusIs, unitFails, verdictIn } from './__fixtures__/review.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

async function open(
  options: BenchOptions = {},
  overrides: (kingdom: Bench) => Partial<StewardDeps> = () => ({}),
) {
  current = await bench(options);
  running = current.steward(overrides(current));
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

describe('the machine checks and the pass rule', () => {
  it('runs the checks before the judge, and fails a pass when a check failed', async () => {
    const calls: string[] = [];
    const diff = ' src/api.ts | 1 +\n\ndiff --git a/src/api.ts b/src/api.ts\n+export const api = 1;';
    const { kingdom, steward } = await open({}, (k) => ({
      plots: plotsWith(
        k.root,
        {
          check: ({ run_dir }) => Promise.resolve([unitFails(questOfRun(run_dir))]),
          diff: () => Promise.resolve(diff),
        },
        calls,
      ),
    }));
    await kingdom.command('create_quest', questPayload('Breaks a test'));
    // Returned and sent back in the same tick: the second attempt says the verdict failed.
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Breaks a test')).attempts === 2,
    );
    const quest = await kingdom.quest('Breaks a test');
    expect(calls.slice(0, 3)).toEqual([
      `commit chore: submit ${quest.id}`,
      `check .runs/${quest.id}-1`,
      'diff folder',
    ]);
    expect(quest.checks_run).toEqual(['unit']);
    const judged = await verdictIn(kingdom, `${quest.id}-1`);
    expect(judged).toMatchObject({
      result: 'fail',
      fail_kind: 'tests_fail',
      checks: [{ id: 'unit', pass: false }],
    });
    expect(judged.notes).toContain(`✗ unit: .runs/${quest.id}-1/checks/unit.log`);
    const judgeRequest = [...kingdom.fakes.claude.requests, ...kingdom.fakes.gemini.requests].find(
      ({ role }) => role === 'verifier',
    );
    expect(judgeRequest?.prompt.user).toContain('unit');
    // The judge reads the branch's diff in its prompt (PlotManager.diff, P1-15) and the craft of its class.
    expect(judgeRequest?.prompt.user).toContain(`# Diff\n\n\`\`\`diff\n${diff}\n\`\`\``);
    expect(judgeRequest?.prompt.system).toContain('# Your craft: Judge');
    const assigneeRequest = kingdom.fakes.claude.requests.find(({ role }) => role === 'assignee');
    expect(assigneeRequest?.prompt.system).toContain('# Your craft: Knight');
  });

  it('sends the quest to the infirmary when the territory refuses the commit of the finished work', async () => {
    const refusal = 'eslint: 2 errors in src/api/orders.ts';
    const { kingdom, steward } = await open({}, (k) => ({
      plots: plotsWith(k.root, { commit: () => Promise.resolve({ status: 'refused', detail: refusal }) }),
    }));
    await kingdom.command('create_quest', questPayload('Lint fails'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Lint fails', 'infirmary'));
    expect(kingdom.notices).toEqual([
      expect.objectContaining({ kind: 'infirmary', reason: `breaker:commit: ${refusal}` }),
    ]);
    expect((await kingdom.quest('Lint fails')).attempt_log.at(-1)).toMatchObject({ outcome: 'breaker' });
    expect((await kingdom.character('kael')).status).toBe('idle');
  });

  it('lets the machine judge under machine_only when no judge of another family serves', async () => {
    const cast = [
      { id: 'kael', cls: 'knight' },
      { id: 'sable', cls: 'judge', model: 'claude-opus-5-5' },
    ] as const;
    const { kingdom, steward } = await open({ cast });
    const dispatch = { ...KINGDOM.dispatch, verifier_same_family: 'machine_only' as const };
    const machineOnly = { ...KINGDOM, dispatch };
    expect((await kingdom.store.kingdom.write(machineOnly)).ok).toBe(true);
    await kingdom.command('create_quest', questPayload('Machine judged'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Machine judged', 'done'));
    const quest = await kingdom.quest('Machine judged');
    expect(await verdictIn(kingdom, `${quest.id}-1`)).toMatchObject({
      verifier_id: 'machine',
      result: 'pass',
    });
    expect(quest.attempt_log.map(({ role }) => role)).toEqual(['assignee']);
    expect((await kingdom.character('kael')).reputation.window).toHaveLength(1);
  });
});

describe('verdict files', () => {
  it('keeps a partial verdict apart from the verdict that ends the run', async () => {
    const partial = { result: 'partial', progress: { checked_until: 'src/api/orders.ts' } };
    const { kingdom, steward } = await open({ plays: { verdicts: { 'Long diff': [partial, PASS] } } });
    await kingdom.command('create_quest', questPayload('Long diff'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Long diff', 'done'));
    const quest = await kingdom.quest('Long diff');
    expect(await verdictIn(kingdom, `${quest.id}-1-p1`)).toMatchObject({ result: 'partial' });
    expect(await verdictIn(kingdom, `${quest.id}-1`)).toMatchObject({ result: 'pass' });
    // The second judge reads on from where the first stopped (P1-15); the first had nobody before it.
    const judges = [...kingdom.fakes.claude.requests, ...kingdom.fakes.gemini.requests].filter(
      ({ role }) => role === 'verifier',
    );
    expect(judges.map(({ prompt }) => prompt.user.includes('# Where the last judge stopped'))).toEqual([
      false,
      true,
    ]);
    expect(judges[1]?.prompt.user).toContain('- Checked until: src/api/orders.ts');
    expect(judges[1]?.prompt.user).toContain(`verdict \`${quest.id}-1-p1\``);
  });

  it("writes the owner's seal as a verdict of its own, then archives and releases the plot", async () => {
    const calls: string[] = [];
    const { kingdom, steward } = await open({}, (k) => ({ plots: plotsWith(k.root, {}, calls) }));
    await kingdom.command('create_quest', questPayload('Needs the seal', { seal_required: true }));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Needs the seal', 'awaiting_seal'));
    const waiting = await kingdom.quest('Needs the seal');
    await kingdom.command('seal', { quest: waiting.id });
    await steward.tick();
    expect((await kingdom.quest('Needs the seal')).status).toBe('done');
    expect(await verdictIn(kingdom, `${waiting.id}-1-user`)).toMatchObject({
      verifier_id: 'user',
      by_human: true,
      result: 'pass',
      checks: [],
    });
    await kingdom.command('archive', { quest: waiting.id });
    await steward.tick();
    expect(calls).toContain('release folder');
  });

  it("returns the work with the owner's notes and fail_kind, and the next session reads them", async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('create_quest', questPayload('Owner returns', { seal_required: true }));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Owner returns', 'awaiting_seal'));
    const waiting = await kingdom.quest('Owner returns');
    await kingdom.command('return', { quest: waiting.id, notes: 'Too short.' });
    expect((await steward.tick()).commands).toMatchObject({ rejected: 1 });
    const notes = 'The order total must round half up, see docs/pricing.md.';
    await kingdom.command('return', { quest: waiting.id, notes });
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Owner returns')).attempts === 2,
    );
    expect(await verdictIn(kingdom, `${waiting.id}-1-user`)).toMatchObject({
      verifier_id: 'user',
      result: 'fail',
      fail_kind: 'other',
      notes,
    });
    const windows = (await kingdom.character('kael')).reputation.window;
    expect(windows.map(({ result, by_human }) => [result, by_human]).slice(-2)).toEqual([
      ['pass', false],
      ['fail', true],
    ]);
    expect(kingdom.fakes.claude.requests.at(-1)?.prompt.user).toContain(notes);
  });
});

describe("the assignee's standing", () => {
  it("takes the owner's fail_kind, and raises a level the window has earned", async () => {
    const cast = [
      { id: 'kael', cls: 'knight', passes: 9 },
      { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-low' },
    ] as const;
    const { kingdom, steward } = await open({ cast });
    await kingdom.command('create_quest', questPayload('Earns a level', { seal_required: true }));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Earns a level', 'awaiting_seal'));
    expect(await kingdom.character('kael')).toMatchObject({ level: 4 });
    const waiting = await kingdom.quest('Earns a level');
    const notes = 'Strings in src/routes/sign-in.tsx bypass t(); move them to the locales.';
    await kingdom.command('return', { quest: waiting.id, notes, fail_kind: 'missing_i18n' });
    await steward.tick();
    expect(await verdictIn(kingdom, `${waiting.id}-1-user`)).toMatchObject({ fail_kind: 'missing_i18n' });
    expect((await kingdom.character('kael')).consecutive_fail).toEqual({
      fail_kind: 'missing_i18n',
      count: 1,
    });
  });

  it("leaves the assignee's reputation and fail streak alone on a return for a new judgement (P1-40)", async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('create_quest', questPayload('Misjudged', { seal_required: true }));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Misjudged', 'awaiting_seal'));
    const before = await kingdom.character('kael');
    const waiting = await kingdom.quest('Misjudged');
    const notes = 'The judge broke nothing: pnpm.ps1 was blocked. Hand it in again unchanged.';
    await kingdom.command('return', { quest: waiting.id, notes, rejudge: true });
    await steward.tick();
    expect(await verdictIn(kingdom, `${waiting.id}-1-user`)).toMatchObject({
      result: 'fail',
      fail_kind: 'other',
      rejudge: true,
    });
    expect((await kingdom.quest('Misjudged')).status).not.toBe('awaiting_seal');
    const after = await kingdom.character('kael');
    expect([after.reputation, after.consecutive_fail, after.level]).toEqual([
      before.reputation,
      before.consecutive_fail,
      before.level,
    ]);
  });
});

describe('the fail streak', () => {
  it('sends the assignee to the Temple after three fails of one kind, and rings the bell', async () => {
    const fails = Array.from({ length: 3 }, () => ({
      result: 'fail',
      fail_kind: 'tests_fail',
      notes: 'pnpm test fails in src/api/orders.spec.ts: the total ignores the discount.',
    }));
    const cast = [
      { id: 'kael', cls: 'knight' },
      { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-low' },
    ] as const;
    const { kingdom, steward } = await open({ cast, plays: { verdicts: { 'Fails thrice': fails } } });
    await kingdom.command('create_quest', questPayload('Fails thrice'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.character('kael')).status === 'suspended',
    );
    expect((await kingdom.quest('Fails thrice')).status).toBe('infirmary');
    expect(kingdom.notices).toContainEqual({
      kind: 'suspended',
      character: 'kael',
      fail_kind: 'tests_fail',
      count: 3,
    });
  });
});
