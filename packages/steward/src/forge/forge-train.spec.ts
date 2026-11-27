// The delivery train of a `deferred` territory (CM-08, plans/check-modes.md "Tàu giao hàng") on the forge bench. Three
// sealed quests leave on one train once it is full: one pull request merges them, each quest has its `delivery.merged`
// naming the train and is archived, and no train branch stays. A quest ready to start that waits for the scope of one on
// the platform sends the train off at once. A red train fails each quest aboard ((620)), and a quest whose branch
// conflicts with main leaves it for a merge quest. A Steward stopped mid-train leaves no branch and writes no line;
// the next one runs the train anew.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import { afterEach, describe, expect, it } from 'vitest';

import { forgeBench } from '../__fixtures__/forge-bench.ts';
import { git, gitPlots } from '../__fixtures__/git-plots.ts';
import { questPayload, settled, tickUntil } from '../__fixtures__/kingdom.ts';
import { onMain, sealedTogether, statusOf } from '../__fixtures__/queue.ts';
import type { TempDir } from '@elvaria/testkit';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';
import type { Plots } from '../types.ts';

let current: ForgeBench | undefined;
const clones: TempDir[] = [];

afterEach(async () => {
  await current?.remove();
  current = undefined;
  await Promise.all(clones.splice(0).map((folder) => folder.remove()));
});

/** The territory's one check, left to the train: red while the tree holds red.txt. */
const CHECK = [
  "import { existsSync } from 'node:fs';",
  "if (existsSync('red.txt')) console.error('error: red.txt is here');",
  "process.exit(existsSync('red.txt') ? 1 : 0);",
  '',
].join('\n');
const CHECKS = [
  { id: 'state', run: 'node check.mjs', when: ['**'], timeout_minutes: 1, defer_to_merge: true },
];
const IDENTITY = ['-c', 'user.name=Owner', '-c', 'user.email=owner@elvaria.invalid'];
const LEAVES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  Alpha: { 'src/alpha.ts': 'alpha\n' },
  Beta: { 'src/beta.ts': 'beta\n' },
  Gamma: { 'src/gamma.ts': 'gamma\n' },
  Clash: { 'README.md': '# clash\n' },
  Red: { 'red.txt': 'red\n' },
};

async function trainBench(): Promise<ForgeBench> {
  current = await forgeBench({
    delivery: { mode: 'pr_merge', merge_method: 'merge' },
    files: { 'check.mjs': CHECK },
    territory: {
      checks: CHECKS,
      check_policy: { mode: 'deferred', train: { max_quests: 3, max_wait_minutes: 600 } },
    },
    leaves: (req) => LEAVES[req.quest?.title ?? ''] ?? {},
  });
  return current;
}

const ran = async (bench: ForgeBench) => (await bench.lines('train.ran')).map(({ data }) => data);
const trainBranches = (bench: ForgeBench) => git(bench.remote, 'for-each-ref', 'refs/heads/train');
const idOf = async (bench: ForgeBench, title: string) => (await bench.kingdom.quest(title)).id;

/** The owner moves main's README on the remote. */
async function moveMain(bench: ForgeBench): Promise<void> {
  const folder = await tempDir('train clone');
  clones.push(folder);
  git(folder.root, 'clone', '-q', '-c', 'core.autocrlf=false', bench.remote, '.');
  await writeFile(path.join(folder.root, 'README.md'), '# moved\n');
  git(folder.root, ...IDENTITY, 'commit', '-q', '-am', 'move');
  git(folder.root, 'push', '-q', 'origin', 'main');
}

describe('the delivery train of a deferred territory (CM-08)', () => {
  it('merges three sealed quests by one pull request, archives them and leaves no train branch', async () => {
    const bench = await trainBench();
    const steward = await bench.start();
    await sealedTogether(bench, steward, ['Alpha', 'Beta', 'Gamma']);
    await tickUntil(steward, bench.kingdom.clock, async () => (await ran(bench)).length === 1, 200);
    const archived = async () =>
      (await Promise.all(['Alpha', 'Beta', 'Gamma'].map((title) => statusOf(bench, title)))).every(
        (status) => status === 'archived',
      );
    await tickUntil(steward, bench.kingdom.clock, archived, 100);
    const quests = await Promise.all(['Alpha', 'Beta', 'Gamma'].map((title) => idOf(bench, title)));
    const main = git(bench.remote, 'rev-parse', 'main');
    const [train] = await ran(bench);
    expect(train).toMatchObject({
      outcome: 'green',
      departure: 'full',
      pr: 1,
      merge_sha: main,
      patrolled: true,
    });
    expect((train?.steps as { quest: string }[]).map(({ quest }) => quest)).toEqual(quests);
    expect([...bench.forge.pulls.keys()]).toEqual([`train/dc1-se-team/${String(train?.train)}`]);
    const merged = (await bench.lines('delivery.merged')).map(({ data }) => data);
    expect(merged.map(({ quest }) => quest)).toEqual(quests);
    for (const line of merged)
      expect(line).toMatchObject({
        train: train?.train,
        merge_sha: main,
        method: 'merge',
        branch_deleted: false,
      });
    expect(await bench.lines('delivery.pushed')).toEqual([]);
    const ends = (await bench.lines('check.end')).filter(({ data }) => data.train !== undefined);
    expect(ends.map(({ data }) => [data.train, data.outcome])).toEqual([[train?.train, 'pass']]);
    expect(trainBranches(bench)).toBe('');
    expect(['alpha', 'beta', 'gamma'].map((name) => onMain(bench, `src/${name}.ts`))).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
  });

  it('leaves at once when a quest ready to start waits for the scope of one on the platform', async () => {
    const bench = await trainBench();
    const steward = await bench.start();
    const { kingdom } = bench;
    const scope = { seal_required: true, scope_paths: ['src/**'] };
    await kingdom.command('create_quest', questPayload('Alpha', scope));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(bench, 'Alpha')) === 'awaiting_seal',
      120,
    );
    await kingdom.command('create_quest', questPayload('Beta', scope));
    await steward.tick();
    await settled(steward);
    expect(await statusOf(bench, 'Beta')).toBe('open');
    await kingdom.command('seal', { quest: await idOf(bench, 'Alpha') });
    await tickUntil(steward, kingdom.clock, async () => (await ran(bench)).length === 1, 200);
    const [train] = await ran(bench);
    expect(train).toMatchObject({ outcome: 'green', departure: 'scope' });
    expect(onMain(bench, 'src/alpha.ts')).toBe('alpha');
  });

  it('fails each quest aboard a red train, and one that conflicts with main leaves it for a merge quest', async () => {
    const bench = await trainBench();
    const steward = await bench.start();
    await sealedTogether(bench, steward, ['Clash', 'Red', 'Alpha']);
    await moveMain(bench);
    const main = git(bench.remote, 'rev-parse', 'main');
    await tickUntil(steward, bench.kingdom.clock, async () => (await ran(bench)).length === 1, 200);
    const [clash, red, alpha] = await Promise.all(
      ['Clash', 'Red', 'Alpha'].map((title) => idOf(bench, title)),
    );
    const [train] = await ran(bench);
    expect(train).toMatchObject({
      outcome: 'red',
      left: [{ quest: clash, reason: 'conflict' }],
      checks: [{ id: 'state', line: expect.stringContaining('red.txt is here') as string }],
    });
    expect((train?.steps as { quest: string }[]).map(({ quest }) => quest)).toEqual([red, alpha]);
    const failed = (await bench.lines('delivery.failed')).map(({ data }) => data);
    expect(failed.map(({ quest, stage, reason }) => [quest, stage, reason])).toEqual([
      [clash, 'train', 'conflict'],
      [red, 'train', 'checks_red'],
      [alpha, 'train', 'checks_red'],
    ]);
    expect(failed[0]).toMatchObject({ paths: ['README.md'], merge_quest: expect.any(String) as string });
    expect(failed[1]).toMatchObject({
      train: train?.train,
      checks: [{ name: 'state', conclusion: 'failure' }],
    });
    expect(bench.forge.pulls.size).toBe(0);
    expect(git(bench.remote, 'rev-parse', 'main')).toBe(main);
    expect(trainBranches(bench)).toBe('');
  });

  it('leaves no branch and no line when the Steward stops mid-train; the next Steward runs it anew', async () => {
    const bench = await trainBench();
    const plots = gitPlots(bench.kingdom.root);
    let stopping: Promise<void> | undefined;
    const train: Plots['train'] = (territory, board, signal) => {
      if (plots.train === undefined) throw new Error('fixture: no train plots');
      const started: typeof board.started = async (point) => {
        await board.started?.(point);
        stopping ??= steward.stop();
      };
      return plots.train(territory, { ...board, started }, signal);
    };
    const steward = await bench.start({ plots: { ...plots, train } });
    await sealedTogether(bench, steward, ['Alpha']);
    const { clock } = bench.kingdom;
    await tickUntil(steward, clock, () => Promise.resolve(stopping !== undefined), 200);
    await stopping;
    expect(await ran(bench)).toEqual([]);
    expect([...(await bench.lines('delivery.failed')), ...(await bench.lines('delivery.merged'))]).toEqual(
      [],
    );
    expect(trainBranches(bench)).toBe('');
    expect(git(bench.repo, 'branch', '--list', 'train*')).toBe('');
    expect(git(bench.repo, 'worktree', 'list')).not.toContain('train-');
    const next = await bench.start();
    await tickUntil(next, clock, async () => (await ran(bench)).length === 1, 200);
    const [first] = await bench.lines('check.start');
    const [again] = await ran(bench);
    expect(again).toMatchObject({ outcome: 'green' });
    expect(again?.train).not.toBe(first?.data.train);
  });
});
