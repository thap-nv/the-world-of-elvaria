// The probe after a red patrol (CM-04) on a real git repo whose path has spaces, with real checks: the owner's patrol
// finds main green, merges and commits move it, the next patrol finds it red, and the probe names why in one
// `check.attributed`: the second of three merges red on its own (own_change, that quest), two merges red only together
// (combination, the later one), the owner's own commit (outside), a check red once then green (flaky), and a branch
// red at its first patrol (unknown, nothing run). The quests' merges are the log's `delivery.merged` lines.
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { EventSchema } from '@elvaria/domain';
import type { QuestId } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { git, gitPlots, gitRepoWith, onRepo } from '../__fixtures__/git-plots.ts';
import { bench } from '../__fixtures__/kingdom.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { Steward } from '../types.ts';

// The plot is <repo>/.elvaria/worktrees/<name>: four levels up is the kingdom, where the one-time flake waits.
const CHECK = [
  "import { existsSync, readFileSync, rmSync } from 'node:fs';",
  "const flake = '../../../../flake';",
  "if (existsSync(flake)) { rmSync(flake); console.error('Error: flaked'); process.exit(1); }",
  "if (readFileSync('state.txt', 'utf8').trim() === 'red') { console.error('Error: red'); process.exit(1); }",
  "if (existsSync('x.txt') && existsSync('y.txt')) { console.error('Error: x and y'); process.exit(1); }",
  "console.log('green');",
].join('\n');
const CODE = 'dc1-se-team';
const TS = '2026-11-07T09:00:00+07:00';
const [Q1, Q2, Q3] = ['aaaaa1', 'aaaaa2', 'aaaaa3'].map((tail) => `q_20261107_${tail}` as QuestId) as [
  QuestId,
  QuestId,
  QuestId,
];

let current: Bench | undefined;
let running: Steward | undefined;
afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** A bench whose code territory is a git repo with one check and a patrol, probes on; main green at `green`. */
async function open(state = 'green') {
  const kingdom = await bench({ cast: [] });
  current = kingdom;
  const repo = await gitRepoWith(path.join(kingdom.root, 'the repo'), {
    'check.mjs': CHECK,
    'state.txt': `${state}\n`,
  });
  const checks = [{ id: 'unit', run: 'node check.mjs', when: ['**'], timeout_minutes: 5 }];
  await onRepo(kingdom, repo, [], { checks, patrol: { scans: [] } });
  running = kingdom.steward({ plots: gitPlots(kingdom.root, { probe: true }) });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom, repo, steward: running, green: git(repo, 'rev-parse', 'HEAD') };
}

/** The owner's `territory patrol --now`, its probe included, run to its end. */
async function patrolNow(kingdom: Bench, steward: Steward): Promise<void> {
  await kingdom.command('patrol', { territory: CODE });
  await steward.tick();
  await steward.idle();
}

const commitOn = async (repo: string, files: Readonly<Record<string, string>>, message: string) => {
  for (const [file, text] of Object.entries(files)) await writeFile(path.join(repo, file), text);
  git(repo, 'add', '--all');
  git(repo, 'commit', '-q', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
};

let serial = 0;
/**
 * `quest`'s branch from `from` with `files`, the base branch merged in first when `update` (the merge queue's update),
 * merged into main as the Steward does it, and its `delivery.merged`; its own commit and the merge's.
 */
async function deliver(
  kingdom: Bench,
  repo: string,
  quest: QuestId,
  from: string,
  files: Record<string, string>,
  update = false,
) {
  git(repo, 'switch', '-q', '-c', `quest/${quest}`, from);
  const own = await commitOn(repo, files, quest);
  if (update) git(repo, 'merge', '-q', '--no-ff', '-m', 'update', 'main');
  const head = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'switch', '-q', 'main');
  git(repo, 'merge', '-q', '--no-ff', '-m', `merge ${quest}`, `quest/${quest}`);
  const merge = git(repo, 'rev-parse', 'HEAD');
  serial += 1;
  const pr = { number: serial, url: `https://github.com/o/r/pull/${serial}` };
  const data = {
    quest,
    territory: CODE,
    branch: `quest/${quest}`,
    head,
    pr,
    merge_sha: merge,
    method: 'merge',
  };
  const line = { v: 2, id: `01JG${String(serial).padStart(22, '0')}`, ts: TS, type: 'delivery.merged' };
  const event = { ...line, actor: { kind: 'steward' }, quest, territory: CODE };
  await openEventLog(kingdom.root).append([
    EventSchema.parse({ ...event, data: { ...data, sealed: true, branch_deleted: true } }),
  ]);
  return { own, merge };
}

/** The probe's lines: the cause, the step, the culprit, and each run's commit and whether it passed. */
async function attributions(kingdom: Bench) {
  return (await openEventLog(kingdom.root).read()).events.flatMap((event) =>
    event.type === 'check.attributed' ? [event.data] : [],
  );
}

const ran = (commit: string, pass: boolean, quest?: QuestId) => ({
  commit,
  ...(quest === undefined ? {} : { quest }),
  pass,
  duration_ms: expect.any(Number) as unknown,
});

describe('the probe after a red patrol (CM-04)', () => {
  it('three merges, the second red on its own: own_change, that quest', async () => {
    const { kingdom, repo, steward, green } = await open();
    await patrolNow(kingdom, steward);
    const first = await deliver(kingdom, repo, Q1, green, { 'a.txt': 'a\n' });
    const second = await deliver(kingdom, repo, Q2, green, { 'state.txt': 'red\n' });
    await deliver(kingdom, repo, Q3, green, { 'b.txt': 'b\n' });
    await patrolNow(kingdom, steward);
    expect(await attributions(kingdom)).toEqual([
      {
        territory: CODE,
        source: 'patrol',
        checks: ['unit'],
        runs: [
          ran(first.merge, true),
          ran(second.merge, false),
          ran(second.merge, false),
          ran(second.own, false, Q2),
        ],
        commit: second.merge,
        culprit: Q2,
        cause: 'own_change',
      },
    ]);
    // Attributed: the next patrol of the still red branch probes nothing again, and the probe's plot is gone.
    await patrolNow(kingdom, steward);
    expect(await attributions(kingdom)).toHaveLength(1);
    expect(existsSync(path.join(repo, '.elvaria', 'worktrees', `probe-${CODE}`))).toBe(false);
  });

  it("red only once merged together: combination, the later quest, its own head before the queue's update", async () => {
    const { kingdom, repo, steward, green } = await open();
    await patrolNow(kingdom, steward);
    const first = await deliver(kingdom, repo, Q1, green, { 'x.txt': 'x\n' });
    const second = await deliver(kingdom, repo, Q2, green, { 'y.txt': 'y\n' }, true);
    await patrolNow(kingdom, steward);
    const [found] = await attributions(kingdom);
    expect(found).toMatchObject({ commit: second.merge, culprit: Q2, cause: 'combination' });
    // Two steps: the first merge green, the second red again, then Q2's own commit (y alone) green.
    expect(found?.runs).toEqual([
      ran(first.merge, true),
      ran(second.merge, false),
      ran(second.own, true, Q2),
    ]);
  });

  it("the owner's own commit: outside, no culprit", async () => {
    const { kingdom, repo, steward, green } = await open();
    await patrolNow(kingdom, steward);
    const first = await deliver(kingdom, repo, Q1, green, { 'a.txt': 'a\n' });
    const owner = await commitOn(repo, { 'state.txt': 'red\n' }, 'by hand');
    await patrolNow(kingdom, steward);
    expect(await attributions(kingdom)).toEqual([
      expect.objectContaining({
        runs: [ran(first.merge, true), ran(owner, false)],
        commit: owner,
        cause: 'outside',
      }),
    ]);
    expect((await attributions(kingdom))[0]).not.toHaveProperty('culprit');
  });

  it('red once, green when run again on the same commit: flaky', async () => {
    const { kingdom, repo, steward } = await open();
    await patrolNow(kingdom, steward);
    const owner = await commitOn(repo, { 'notes.md': '# notes\n' }, 'notes');
    await writeFile(path.join(kingdom.root, 'flake'), 'once\n');
    await patrolNow(kingdom, steward);
    expect(await attributions(kingdom)).toEqual([
      expect.objectContaining({ runs: [ran(owner, true)], commit: owner, cause: 'flaky' }),
    ]);
  });

  it('red at its first patrol: no green head, unknown, nothing run', async () => {
    const { kingdom, steward } = await open('red');
    await patrolNow(kingdom, steward);
    expect(await attributions(kingdom)).toEqual([
      { territory: CODE, source: 'patrol', checks: ['unit'], runs: [], cause: 'unknown' },
    ]);
  });
});
