// The base branch merged into a quest's branch before the checks after its session (RC-05, ADR 0035, plans/recheck.md
// §2.5) on the forge bench: real git, main moved once while the quest's session ran, checks that say what they ran and
// carried (the check ledger's). Green on the merge: kept, `plot.merged` before the judge, nothing left for the queue.
// A conflict no rule resolves: no early merge. Red by the quest: taken back, red again on the head as submitted, the
// quest returned. Red by the merge: green on that head, the rest run with the red one carried, the judge in. A
// Steward stopped on the merge: the next one finds it pending and makes no second merge commit.
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { git, gitPlots } from '../__fixtures__/git-plots.ts';
import { questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import { ledgerCheck, ledgerPatrol } from '../__fixtures__/ledger.ts';
import {
  queueBench,
  recordOf,
  sealedTogether,
  sourceWithIndex,
  statusOf,
  titlesOf,
} from '../__fixtures__/queue.ts';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';
import type { RedOf } from '../__fixtures__/ledger.ts';
import type { Plots, Steward } from '../types.ts';

const CHECKS = [
  { id: 'unit', run: 'node unit.mjs', when: ['src/**'], timeout_minutes: 5 },
  { id: 'lint', run: 'node lint.mjs', when: ['**'], timeout_minutes: 5 },
];
/** What main adds while the quest's session runs: no file the quest touches. */
const MAIN_MOVES = { 'docs/main.md': 'main\n' };

let current: ForgeBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

/**
 * The bench of a territory with CHECKS, its assignee leaving `leaves`; main commits `moves` (and pushes them) once,
 * during the first session. `start` gives a Steward, `over` over its recording Plots.
 */
async function earlyBench(
  leaves: Readonly<Record<string, string>>,
  moves: Readonly<Record<string, string>>,
  red?: RedOf,
) {
  let repo = '';
  let moved = false;
  const leave = () => {
    if (!moved) {
      moved = true;
      for (const [file, text] of Object.entries(moves)) writeFileSync(path.join(repo, file), text);
      git(repo, 'add', '--all');
      git(repo, 'commit', '-q', '-m', 'main moves');
      git(repo, 'push', '-q', 'origin', 'main');
    }
    return leaves;
  };
  const territory = { checks: CHECKS, patrol: { scans: [] }, check_policy: { mode: 'full' } };
  const { bench, steward: first } = await queueBench(leave, { territory });
  repo = bench.repo;
  current = bench;
  await first.stop();
  const checks = ledgerCheck(red);
  const { patrol } = ledgerPatrol(() => git(bench.remote, 'rev-parse', 'main'));
  const plots = { ...gitPlots(bench.kingdom.root, { ledger: true }), check: checks.check, patrol };
  const start = (over: Partial<Plots> = {}) => bench.start({ plots: { ...plots, ...over } });
  const until = (steward: Steward, done: () => Promise<boolean>) =>
    tickUntil(steward, bench.kingdom.clock, done, 200);
  return { bench, checks, start, until };
}

/** The `check.end` lines of the runs after a session, not the queue's. */
const sessionEnds = async (bench: ForgeBench) =>
  (await bench.lines('check.end')).filter(({ data }) => data.delivery !== true);

/** The types of the log's lines among `types`, in the log's order. */
const typesOf = async (bench: ForgeBench, types: readonly string[]) =>
  (await openEventLog(bench.kingdom.root).read()).events
    .map(({ type }) => type)
    .filter((type) => types.includes(type));

const create = (bench: ForgeBench, title: string) =>
  bench.kingdom.command('create_quest', questPayload(title, { seal_required: true }));

const merged = (bench: ForgeBench) => async () => (await titlesOf(bench, 'delivery.merged')).length === 1;

/** The quest's branch, its tree, the subject of its last commit and whether it holds main. */
async function branchOf(bench: ForgeBench, title: string) {
  const { id } = await bench.kingdom.quest(title);
  const branch = `quest/${id}`;
  const holdsMain = () => {
    try {
      git(bench.repo, 'merge-base', '--is-ancestor', 'main', branch);
      return true;
    } catch {
      return false;
    }
  };
  return {
    id,
    branch,
    tree: git(bench.repo, 'rev-parse', `${branch}^{tree}`),
    last: git(bench.repo, 'log', '-1', '--format=%s', branch),
    holdsMain: holdsMain(),
  };
}

/** Alpha's run after its session ran once, green, on the head as submitted: no early merge left on its branch. */
async function ranAsSubmitted(bench: ForgeBench, calls: readonly unknown[]): Promise<void> {
  const alpha = await branchOf(bench, 'Alpha');
  expect(await bench.lines('plot.merged')).toEqual([]);
  const [end] = await sessionEnds(bench);
  expect(end?.data).toMatchObject({ outcome: 'pass', tree: alpha.tree });
  expect(end?.data.taken_back).toBeUndefined();
  expect(alpha).toMatchObject({ last: `chore: submit ${alpha.id}`, holdsMain: false });
  expect(calls).toHaveLength(1);
}

describe('the base branch merged in before the checks after a session (RC-05)', () => {
  it('keeps main merged in on green: plot.merged before the judge, its tree checked, nothing for the queue', async () => {
    const { bench, checks, start, until } = await earlyBench(sourceWithIndex('alpha.ts'), MAIN_MOVES);
    const steward = await start();
    await sealedTogether(bench, steward, ['Alpha']);
    await until(steward, merged(bench));

    const alpha = await branchOf(bench, 'Alpha');
    expect(await typesOf(bench, ['plot.merged', 'check.end', 'quest.verdict'])).toEqual([
      'plot.merged',
      'check.end',
      'quest.verdict',
    ]);
    const [line] = await bench.lines('plot.merged');
    expect(line?.data).toMatchObject({ into: alpha.branch, merged: ['main'] });
    const [end] = await sessionEnds(bench);
    expect(end?.data).toMatchObject({ outcome: 'pass', tree: alpha.tree });
    expect(alpha.last).toBe(`chore: merge main into ${alpha.branch}`);
    expect(checks.calls.map(({ ran }) => ran)).toEqual([['unit', 'lint']]);
  });

  it('merges nothing early on a conflict no rule resolves: the checks run on the head as submitted', async () => {
    const { bench, checks, start, until } = await earlyBench(
      { 'src/a.ts': 'quest\n' },
      { 'src/a.ts': 'main\n' },
    );
    const steward = await start();
    await create(bench, 'Alpha');
    await until(steward, async () => (await sessionEnds(bench)).length === 1);
    await ranAsSubmitted(bench, checks.calls);
  });

  it('takes the merge back when a generator fails after it: the checks run on the head as submitted', async () => {
    const { bench, checks, start, until } = await earlyBench(sourceWithIndex('alpha.ts'), MAIN_MOVES);
    const generate: NonNullable<Plots['generate']> = () =>
      Promise.resolve({ status: 'failed', log_path: 'gen.log', detail: 'exit 1' });
    const steward = await start({ generate });
    await create(bench, 'Alpha');
    await until(steward, async () => (await sessionEnds(bench)).length === 1);
    await ranAsSubmitted(bench, checks.calls);
  });

  it('takes the merge back on red, and the red check red again on the head as submitted returns the quest', async () => {
    // Unit is red on every tree of the quest: its own fail.
    const red: RedOf = (id, runDir) => id === 'unit' && !runDir.endsWith('-delivery');
    const { bench, checks, start, until } = await earlyBench(sourceWithIndex('alpha.ts'), MAIN_MOVES, red);
    const steward = await start();
    await create(bench, 'Alpha');
    await until(steward, async () => (await bench.lines('quest.returned')).length === 1);

    // The quest's next session may be on already: what its first run did is read by that run's number.
    const { branch, id } = await branchOf(bench, 'Alpha');
    const [submitted] = git(
      bench.repo,
      'log',
      '--reverse',
      '--format=%T',
      '--grep=^chore: submit',
      branch,
    ).split('\n');
    const [first, again, ...more] = (await sessionEnds(bench)).filter(({ attempt }) => attempt === 1);
    expect(more).toEqual([]);
    expect(first?.data).toMatchObject({ outcome: 'fail', taken_back: true });
    expect(again?.data).toMatchObject({ outcome: 'fail', tree: submitted });
    expect(again?.data.taken_back).toBeUndefined();
    expect(first?.data.tree).not.toBe(submitted);
    const run = checks.calls.filter(({ run_dir: dir }) => dir === `.runs/${id}-1`);
    expect(run.map(({ ran }) => ran)).toEqual([['unit', 'lint'], ['unit']]);
    expect((await bench.lines('verdict.fail')).map(({ data }) => data.fail_kind)).toEqual(['tests_fail']);
    expect(await bench.lines('plot.merged')).toEqual([]);
  });

  it("runs the rest on the head as submitted when the red was the merge's, the red check carried", async () => {
    const reddened = new Set<string>();
    // Unit is red on the first run after the session only: on the tree with main merged in.
    const red: RedOf = (id, runDir) => {
      if (id !== 'unit' || runDir.endsWith('-delivery') || reddened.has(runDir)) return false;
      reddened.add(runDir);
      return true;
    };
    const { bench, checks, start, until } = await earlyBench(sourceWithIndex('alpha.ts'), MAIN_MOVES, red);
    const steward = await start();
    await sealedTogether(bench, steward, ['Alpha']);
    await until(steward, merged(bench));

    const ends = await sessionEnds(bench);
    expect(ends.map(({ data }) => [data.outcome, data.taken_back])).toEqual([
      ['fail', true],
      ['pass', undefined],
      ['pass', undefined],
    ]);
    const session = checks.calls.filter(({ run_dir: dir }) => !dir.endsWith('-delivery'));
    expect(session.map(({ ran, carried }) => ({ ran, carried }))).toEqual([
      { ran: ['unit', 'lint'], carried: [] },
      { ran: ['unit'], carried: [] },
      { ran: ['lint'], carried: ['unit'] },
    ]);
    expect(ends[2]?.data.checks).toEqual([
      { id: 'unit', pass: true, duration_ms: 0, carried_from: ends[1]?.id },
      { id: 'lint', pass: true, duration_ms: 40 },
    ]);
    expect(ends[2]?.data.tree).toBe(ends[1]?.data.tree);
    expect(ends[1]?.data.tree).not.toBe(ends[0]?.data.tree);
  });

  it('finds the merge a stopped Steward left pending, and makes no second merge commit', async () => {
    const { bench, start, until } = await earlyBench(sourceWithIndex('alpha.ts'), MAIN_MOVES);
    let entered = (): void => undefined;
    const inChecks = new Promise<void>((resolve) => {
      entered = resolve;
    });
    // The checks run until the Steward stops, as long ones would.
    const check: Plots['check'] = ({ signal }) =>
      new Promise((resolve) => {
        entered();
        signal?.addEventListener('abort', () => {
          resolve([]);
        });
      });
    const first = await start({ check });
    await create(bench, 'Alpha');
    const waiting = until(first, async () => (await statusOf(bench, 'Alpha')) === 'awaiting_seal');
    await inChecks;
    await first.stop();
    await waiting.catch(() => undefined);
    const { plot } = await bench.kingdom.quest('Alpha');
    expect(await recordOf(plot.path ?? '')).toMatchObject({ update_pending: true });

    const second = await start();
    await until(second, async () => (await statusOf(bench, 'Alpha')) === 'awaiting_seal');
    const alpha = await branchOf(bench, 'Alpha');
    const subjects = git(bench.repo, 'log', '--format=%s', alpha.branch).split('\n');
    expect(subjects.filter((subject) => subject.startsWith('chore: merge main into'))).toHaveLength(1);
    expect(await bench.lines('plot.merged')).toHaveLength(1);
    expect((await sessionEnds(bench)).at(-1)?.data).toMatchObject({ outcome: 'pass', tree: alpha.tree });
  });
});
