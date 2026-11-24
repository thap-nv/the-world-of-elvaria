// Guest entries of the merge queue (CM-07, plans/check-modes.md "mục khách") on the forge bench. The owner's own
// session pushes a branch to the remote and opens its pull request, then `enqueue_branch`. A green guest is merged
// after the quest whose delivery was due when it came; a guest that conflicts with main and one whose check is red
// are refused, with the files and the check; the session's branch on the remote never moves; two guests of one
// territory are never tried at once.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { FORGE_REMOTE, forgeBench } from '../__fixtures__/forge-bench.ts';
import { git, gitPlots } from '../__fixtures__/git-plots.ts';
import { settled, tickUntil } from '../__fixtures__/kingdom.ts';
import { onMain, sealedTogether, titlesOf } from '../__fixtures__/queue.ts';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';
import type { Plots, Steward } from '../types.ts';

let current: ForgeBench | undefined;
const sessions: TempDir[] = [];

afterEach(async () => {
  await current?.remove();
  current = undefined;
  await Promise.all(sessions.splice(0).map((folder) => folder.remove()));
});

const TERRITORY = 'dc1-se-team';
/** The territory's one check: red while the tree holds red.txt. */
const CHECK = [
  "import { existsSync } from 'node:fs';",
  "if (existsSync('red.txt')) console.error('error: red.txt is here');",
  "process.exit(existsSync('red.txt') ? 1 : 0);",
  '',
].join('\n');
const CHECKS = [{ id: 'state', run: 'node check.mjs', when: ['**'], timeout_minutes: 1 }];
const IDENTITY = ['-c', 'user.name=Owner', '-c', 'user.email=owner@elvaria.invalid'];

async function guestBench(): Promise<ForgeBench> {
  current = await forgeBench({
    delivery: { mode: 'pr_merge' },
    files: { 'check.mjs': CHECK },
    territory: { checks: CHECKS },
    leaves: () => ({ 'src/alpha.ts': 'alpha\n' }),
  });
  return current;
}

/** A clone of the remote, as the owner's session has it. */
async function cloneOf(bench: ForgeBench): Promise<string> {
  const folder = await tempDir('guest session');
  const work = folder.root;
  sessions.push(folder);
  // The checkout keeps LF, as the repo's own files: a CRLF README would conflict with every change of main.
  git(work, 'clone', '-q', '-c', 'core.autocrlf=false', bench.remote, '.');
  return work;
}

/** The owner's session: `branch` off the remote's main with `files`, pushed, its pull request opened. */
async function session(bench: ForgeBench, branch: string, files: Readonly<Record<string, string>>) {
  const work = await cloneOf(bench);
  git(work, 'switch', '-q', '-c', branch);
  for (const [file, text] of Object.entries(files)) await writeFile(path.join(work, file), text);
  git(work, 'add', '-A');
  git(work, ...IDENTITY, 'commit', '-q', '-m', branch);
  git(work, 'push', '-q', 'origin', branch);
  const repo = bench.forge.repoOf(FORGE_REMOTE, bench.repo);
  if (repo === undefined) throw new Error('fixture: no repo');
  const opened = await bench.forge.open(repo, { head: branch, base: 'main', title: branch, body: '' });
  if (!opened.ok) throw new Error('fixture: no pull request');
  return { pr: opened.value.number, branch, head: git(work, 'rev-parse', 'HEAD') };
}

const enqueue = (bench: ForgeBench, pr: number) =>
  bench.kingdom.command('enqueue_branch', { territory: TERRITORY, pr });

const ended = async (bench: ForgeBench, count: number) =>
  (await bench.lines('delivery.guest_merged')).length +
    (await bench.lines('delivery.guest_refused')).length ===
  count;

/** The types of `types`' lines, in the log's order. */
const orderOf = async (bench: ForgeBench, types: readonly string[]) =>
  (await openEventLog(bench.kingdom.root).read()).events
    .filter(({ type }) => types.includes(type))
    .map(({ type, data }) => (typeof data.guest === 'number' ? `${type} #${String(data.guest)}` : type));

async function quiet(steward: Steward, ticks: number): Promise<void> {
  for (let tick = 0; tick < ticks; tick += 1) {
    await steward.tick();
    await settled(steward);
  }
}

describe('guest entries of the merge queue (CM-07)', () => {
  it('merges a green guest after the quest due when it came, its branch untouched', async () => {
    const bench = await guestBench();
    // Alpha's pull request waits on the forge's checks: its lane stays held.
    bench.forge.answer({ state: 'pending' });
    const steward = await bench.start();
    await sealedTogether(bench, steward, ['Alpha']);
    const pushed = async () => (await titlesOf(bench, 'delivery.pushed')).length === 1;
    await tickUntil(steward, bench.kingdom.clock, pushed, 200);
    const guest = await session(bench, 'feat/guest', { 'guest.txt': 'guest\n' });
    await enqueue(bench, guest.pr);
    await quiet(steward, 3);
    // Its lane is held: no check of it started.
    expect((await bench.lines('check.start')).filter(({ data }) => data.guest === guest.pr)).toEqual([]);
    bench.forge.answer({ state: 'green' });
    await tickUntil(steward, bench.kingdom.clock, () => ended(bench, 1), 200);
    const [merged] = await bench.lines('delivery.guest_merged');
    expect(merged?.data).toEqual({
      territory: TERRITORY,
      pr: guest.pr,
      branch: 'feat/guest',
      head: guest.head,
      merge_sha: git(bench.remote, 'rev-parse', 'main'),
      method: 'merge',
    });
    const order = await orderOf(bench, ['delivery.merged', 'delivery.guest_merged']);
    expect(order).toEqual(['delivery.merged', 'delivery.guest_merged']);
    const guestChecks = (await bench.lines('check.end')).filter(({ data }) => data.guest === guest.pr);
    expect(guestChecks.map(({ data }) => [data.delivery, data.outcome])).toEqual([[true, 'pass']]);
    expect(onMain(bench, 'guest.txt')).toBe('guest');
    expect(onMain(bench, 'src/alpha.ts')).toBe('alpha');
    expect(bench.remoteTip('feat/guest')).toBe(guest.head);
  });

  it('refuses a guest that conflicts with main and a red one, with the files and the check', async () => {
    const bench = await guestBench();
    const steward = await bench.start();
    const clash = await session(bench, 'feat/clash', { 'README.md': '# clash\n' });
    const red = await session(bench, 'feat/red', { 'red.txt': 'red\n' });
    // Main moves on under the clash: README.md differs on both sides.
    const work = await cloneOf(bench);
    await writeFile(path.join(work, 'README.md'), '# moved\n');
    git(work, ...IDENTITY, 'commit', '-q', '-am', 'move');
    git(work, 'push', '-q', 'origin', 'main');
    const main = git(bench.remote, 'rev-parse', 'main');
    await enqueue(bench, clash.pr);
    await enqueue(bench, red.pr);
    await tickUntil(steward, bench.kingdom.clock, () => ended(bench, 2), 200);
    const refused = (await bench.lines('delivery.guest_refused')).map(({ data }) => data);
    expect(refused).toEqual([
      {
        territory: TERRITORY,
        pr: clash.pr,
        reason: 'conflict',
        branch: 'feat/clash',
        head: clash.head,
        paths: ['README.md'],
      },
      {
        territory: TERRITORY,
        pr: red.pr,
        reason: 'checks_red',
        branch: 'feat/red',
        head: red.head,
        checks: [{ id: 'state', line: expect.stringContaining('red.txt is here') as string }],
      },
    ]);
    // Neither merged, neither branch written, main where the owner left it; the conflict ran no check.
    expect(bench.forge.merged.size).toBe(0);
    expect([bench.remoteTip('feat/clash'), bench.remoteTip('feat/red')]).toEqual([clash.head, red.head]);
    expect(git(bench.remote, 'rev-parse', 'main')).toBe(main);
    expect(await orderOf(bench, ['check.start', 'check.end'])).toEqual([
      `check.start #${String(red.pr)}`,
      `check.end #${String(red.pr)}`,
    ]);
  });

  it('tries two guests of one territory one after the other, in the order they came', async () => {
    const bench = await guestBench();
    const plots = gitPlots(bench.kingdom.root);
    let running = 0;
    let most = 0;
    const guest: Plots['guest'] = async (territory, pull, signal) => {
      running += 1;
      most = Math.max(most, running);
      try {
        if (plots.guest === undefined) throw new Error('fixture: no guest plots');
        return await plots.guest(territory, pull, signal);
      } finally {
        running -= 1;
      }
    };
    const steward = await bench.start({ plots: { ...plots, guest } });
    const first = await session(bench, 'feat/first', { 'first.txt': 'first\n' });
    const second = await session(bench, 'feat/second', { 'second.txt': 'second\n' });
    await enqueue(bench, first.pr);
    await enqueue(bench, second.pr);
    await tickUntil(steward, bench.kingdom.clock, () => ended(bench, 2), 200);
    expect((await bench.lines('delivery.guest_merged')).map(({ data }) => data.pr)).toEqual([
      first.pr,
      second.pr,
    ]);
    expect(most).toBe(1);
    expect([onMain(bench, 'first.txt'), onMain(bench, 'second.txt')]).toEqual(['first', 'second']);
  });
});
