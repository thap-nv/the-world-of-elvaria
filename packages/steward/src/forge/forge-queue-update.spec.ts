// The merge queue's update of one branch (PS-09) on the forge bench: nothing when main did not move (no commit, no
// check run again), red checks after the merge stop the delivery before its push and open the merge queue's merge
// quest with the end of their log (PS-09b), an open pull request that main overtook is updated and pushed again once,
// and a Steward stopped in the middle of a generator makes no second merge.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isQueueMerge } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { git, gitPlots } from '../__fixtures__/git-plots.ts';
import { questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import { queueBench, sealedTogether, sourceWithIndex, statusOf, titlesOf } from '../__fixtures__/queue.ts';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';
import type { CheckRun } from '@elvaria/runner-core';
import type { Plots } from '../types.ts';

let current: ForgeBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const RED: CheckRun = {
  id: 'unit' as CheckRun['id'],
  pass: false,
  duration_ms: 1,
  log_path: '.runs/q-delivery/checks/unit.log',
  exit_code: 1,
  timed_out: false,
};

const pushes = async (bench: ForgeBench, title: string) =>
  (await titlesOf(bench, 'delivery.pushed')).filter((each) => each === title).length;

describe("the merge queue's update of a branch (PS-09)", () => {
  it('adds no commit and runs no check again when main did not move', async () => {
    const { bench, steward } = await queueBench(
      { Alpha: sourceWithIndex('alpha.ts') },
      { delivery: { mode: 'pr' } },
    );
    current = bench;
    await bench.kingdom.command('create_quest', questPayload('Alpha'));
    await tickUntil(steward, bench.kingdom.clock, async () => (await pushes(bench, 'Alpha')) === 1, 120);

    const alpha = await bench.kingdom.quest('Alpha');
    const [pushed] = await bench.lines('delivery.pushed');
    expect(pushed?.data.head).toBe(git(alpha.plot.path ?? '', 'rev-parse', 'HEAD'));
    expect(git(alpha.plot.path ?? '', 'log', '-1', '--format=%s')).toBe(`chore: submit ${alpha.id}`);
    expect(await bench.lines('plot.merged')).toEqual([]);
    expect((await bench.lines('check.start')).filter(({ data }) => data.delivery === true)).toEqual([]);
  });

  it('pushes nothing when a check is red on the merged branch, and opens a merge quest with its log', async () => {
    const leaves = { Alpha: sourceWithIndex('alpha.ts'), Beta: sourceWithIndex('beta.ts') };
    const { bench, steward: first } = await queueBench(leaves);
    current = bench;
    await first.stop();
    const plots = gitPlots(bench.kingdom.root);
    // The queue's checks write their log in the kingdom, as runner-core's do; a session's checks pass.
    const check: Plots['check'] = async (request) => {
      if (!request.run_dir.endsWith('-delivery')) return [];
      const log = `${request.run_dir}/checks/unit.log`;
      await mkdir(path.join(bench.kingdom.root, request.run_dir, 'checks'), { recursive: true });
      await writeFile(path.join(bench.kingdom.root, log), '> vitest\nFAIL src/beta.spec.ts > adds a room\n');
      return [{ ...RED, log_path: log }];
    };
    const steward = await bench.start({ plots: { ...plots, check } });
    await sealedTogether(bench, steward, ['Alpha', 'Beta']);
    await tickUntil(
      steward,
      bench.kingdom.clock,
      async () => (await bench.lines('delivery.failed')).length > 0,
      160,
    );

    const beta = await bench.kingdom.quest('Beta');
    const failed = (await bench.lines('delivery.failed')).at(-1);
    expect(failed?.data).toMatchObject({
      quest: beta.id,
      stage: 'update',
      reason: 'checks_red',
      checks: [{ name: 'unit', conclusion: 'failure' }],
    });
    const [merge, ...more] = (await bench.kingdom.quests()).filter(isQueueMerge);
    expect(more).toEqual([]);
    expect(failed?.data.merge_quest).toBe(merge?.id);
    expect(merge?.description).toContain(
      '- unit, the end of its log:\n```\n> vitest\nFAIL src/beta.spec.ts > adds a room\n```',
    );
    expect(bench.remoteTip(`quest/${beta.id}`)).toBe('');
    // The merge stays on the branch, not pushed, for whoever resolves it.
    expect(git(beta.plot.path ?? '', 'log', '-2', '--format=%s')).toContain(
      `chore: merge main into quest/${beta.id}`,
    );
    const ends = (await bench.lines('check.end')).filter(({ data }) => data.delivery === true);
    expect(ends.map(({ data }) => data.outcome)).toEqual(['fail']);
  });

  it('updates an open pull request once main overtook it, and pushes it again once', async () => {
    const leaves = { Alpha: sourceWithIndex('alpha.ts'), Beta: sourceWithIndex('beta.ts') };
    const { bench, steward } = await queueBench(leaves);
    current = bench;
    const { kingdom } = bench;
    // Alpha has no seal: under pr_merge it stops at its pull request, which nobody merges.
    await kingdom.command('create_quest', questPayload('Alpha'));
    await tickUntil(steward, kingdom.clock, async () => (await pushes(bench, 'Alpha')) === 1, 120);
    await sealedTogether(bench, steward, ['Beta']);
    await tickUntil(steward, kingdom.clock, async () => (await pushes(bench, 'Alpha')) === 2, 160);
    // Ten minutes and more of looks: Alpha merges cleanly now, and stays as it is.
    for (let minute = 0; minute < 12; minute += 1) {
      await steward.tick();
      await steward.idle();
      kingdom.clock.advance(1);
    }

    expect(await statusOf(bench, 'Beta')).toBe('archived');
    expect(await pushes(bench, 'Alpha')).toBe(2);
    const alpha = await kingdom.quest('Alpha');
    const second = (await bench.lines('delivery.pushed')).at(-1);
    expect(bench.remoteTip(`quest/${alpha.id}`)).toBe(second?.data.head);
    expect(git(bench.remote, 'merge-base', '--is-ancestor', 'main', `quest/${alpha.id}`)).toBe('');
    expect(await bench.lines('delivery.failed')).toEqual([]);
  });

  it('makes one merge only when the Steward stopped in the middle of a generator', async () => {
    const leaves = { Alpha: sourceWithIndex('alpha.ts'), Beta: sourceWithIndex('beta.ts') };
    const { bench, steward } = await queueBench(leaves);
    current = bench;
    const plots = gitPlots(bench.kingdom.root);
    let entered = (): void => undefined;
    const inGenerator = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held: Plots = {
      ...plots,
      // The generator runs until the Steward stops, as a long one would.
      generate: (_plot, _territory, request) =>
        new Promise((resolve) => {
          entered();
          request.signal?.addEventListener('abort', () => {
            resolve({ status: 'failed', log_path: 'x', detail: 'stopped before its end' });
          });
        }),
    };
    await steward.stop();
    const first = await bench.start({ plots: held });
    await sealedTogether(bench, first, ['Alpha', 'Beta']);
    const waiting = tickUntil(
      first,
      bench.kingdom.clock,
      async () => (await statusOf(bench, 'Beta')) === 'archived',
      160,
    );
    await inGenerator;
    await first.stop();
    await waiting.catch(() => undefined);
    const second = await bench.start({ plots });
    await tickUntil(
      second,
      bench.kingdom.clock,
      async () => (await statusOf(bench, 'Beta')) === 'archived',
      160,
    );

    const beta = await bench.kingdom.quest('Beta');
    expect(
      git(bench.repo, 'log', '--format=%s', `quest/${beta.id}`).match(/chore: merge main into/g),
    ).toHaveLength(1);
    expect(await bench.lines('delivery.failed')).toEqual([]);
    expect(await titlesOf(bench, 'delivery.merged')).toEqual(['Alpha', 'Beta']);
  });
});
