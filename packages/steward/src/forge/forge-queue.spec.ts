// The merge queue on a territory that delivers by `pr_merge` (implementation-plan §3.16.7, ADR 0023; PS-09), on a real
// git repo whose origin is a bare repo and a fake forge that merges there for real: each sealed quest's branch is
// brought up to main before its push, hot files resolved by their rule and the generators run, so every quest reaches
// main with no merge quest and nobody resolving a hot file by hand; small work goes first; a conflict no rule resolves
// stops the delivery at `update`, the plot left as it was, and opens the merge queue's merge quest
// (forge-queue-merge.spec.ts, PS-09b).
import { afterEach, describe, expect, it } from 'vitest';

import { git } from '../__fixtures__/git-plots.ts';
import { tickUntil } from '../__fixtures__/kingdom.ts';
import {
  PLAN,
  indexOf,
  onMain,
  queueBench,
  recordOf,
  sealedTogether,
  sourceWithIndex,
  statusOf,
  titlesOf,
} from '../__fixtures__/queue.ts';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';

let current: ForgeBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const settledAll =
  (bench: ForgeBench, titles: readonly string[], done: (status: string) => boolean) => async () =>
    (await Promise.all(titles.map((title) => statusOf(bench, title)))).every(done);

describe('the merge queue under pr_merge (PS-09)', () => {
  it('brings three parallel quests to main, two regenerating one file, small work first, the index right', async () => {
    const leaves = {
      Alpha: sourceWithIndex('alpha.ts'),
      Beta: sourceWithIndex('beta.ts'),
      Gamma: { 'src/gamma.ts': 'gamma.ts\n' },
    };
    const generate = ['node gen.mjs', 'node stray.mjs'];
    const { bench, steward } = await queueBench(leaves, { territory: { commands: { generate } } });
    current = bench;
    const titles = ['Alpha', 'Beta', 'Gamma'];
    await sealedTogether(bench, steward, titles);
    await tickUntil(
      steward,
      bench.kingdom.clock,
      settledAll(bench, titles, (status) => status === 'archived'),
      160,
    );

    expect(await bench.lines('delivery.failed')).toEqual([]);
    expect(await bench.lines('quest.created')).toHaveLength(3);
    // Gamma touched no hot file and goes first; each next quest is updated on the one before, once it is merged.
    expect(await titlesOf(bench, 'delivery.merged')).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(await titlesOf(bench, 'delivery.pushed')).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(onMain(bench, 'docs/gen/index.txt')).toBe(indexOf('alpha.ts', 'beta.ts', 'gamma.ts').trim());
    const merges = (await bench.lines('plot.merged')).map(({ data }) => data);
    expect(merges).toContainEqual(
      expect.objectContaining({ resolved: [{ path: 'docs/gen/index.txt', rule: 'regenerate' }] }),
    );
    // The stray generator's files went back, and the owner hears of it; README on main is the territory's own.
    expect(merges.every((data) => JSON.stringify(data.restored) === '["README.md","stray.txt"]')).toBe(true);
    expect(bench.kingdom.warnings.join('\n')).toContain(
      'changed files outside shared_paths: README.md, stray.txt',
    );
    expect(onMain(bench, 'README.md')).toBe('# dc1');
    // The queue's checks are marked, so the metrics leave them out.
    expect((await bench.lines('check.end')).filter(({ data }) => data.delivery === true)).toHaveLength(2);
  });

  it('joins two changes to adjacent lines of a union file, and stops a third that changed one of them too', async () => {
    const leaves = {
      Alpha: { 'docs/plan.md': PLAN.replace('two', 'TWO') },
      Beta: { 'docs/plan.md': PLAN.replace('three', 'THREE') },
      Gamma: { 'docs/plan.md': PLAN.replace('two', 'deux') },
    };
    const { bench, steward } = await queueBench(leaves);
    current = bench;
    const titles = ['Alpha', 'Beta', 'Gamma'];
    await sealedTogether(bench, steward, titles);
    const gamma = await bench.kingdom.quest('Gamma');
    const worktree = gamma.plot.path ?? '';
    const before = { head: git(worktree, 'rev-parse', 'HEAD'), record: await recordOf(worktree) };
    const ended = async () => (await titlesOf(bench, 'delivery.failed')).includes('Gamma');
    await tickUntil(steward, bench.kingdom.clock, ended, 160);
    await tickUntil(
      steward,
      bench.kingdom.clock,
      settledAll(bench, ['Alpha', 'Beta'], (s) => s === 'archived'),
    );

    expect(onMain(bench, 'docs/plan.md')).toBe('one\nTWO\nTHREE\nfour');
    const [failed, ...more] = await bench.lines('delivery.failed');
    expect(more).toEqual([]);
    expect(failed?.data).toEqual({
      quest: gamma.id,
      territory: 'dc1-se-team',
      stage: 'update',
      reason: 'conflict',
      branch: `quest/${gamma.id}`,
      paths: ['docs/plan.md'],
      merge_quest: expect.any(String) as unknown,
    });
    expect(git(worktree, 'rev-parse', 'HEAD')).toBe(before.head);
    expect(git(worktree, 'status', '--porcelain')).toBe('');
    expect(await recordOf(worktree)).toEqual(before.record);
    expect(bench.remoteTip(`quest/${gamma.id}`)).toBe('');
    expect(await statusOf(bench, 'Gamma')).toBe('done');
  });
});
