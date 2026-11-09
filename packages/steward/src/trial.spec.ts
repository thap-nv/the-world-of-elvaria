// Tests as the product (implementation-plan §3.15, ADR 0022; P1-20), end to end on fake e2e quests: a real git repo
// and PlotManager, the territory's check run for real in the judge's scratch plot (three times), and a fake judge
// that really breaks the code there and runs the quest's test, as the ritual's break_and_expect_red asks. The quest's
// branch never changes, the scratch plot is gone after the verdict, and a flaky test opens a fix quest.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { NO_HISTORY_COMMAND, scratchIdOf } from '@elvaria/runner-core';
import { fromPortable, pathExists } from '@elvaria/store';
import type { TerritoryId, Verdict } from '@elvaria/domain';
import type { AgentRunner, FakeRunner, SpawnRequest } from '@elvaria/runner-core';
import { TerritorySchema } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { git, gitPlots, gitRepoWith } from './__fixtures__/git-plots.ts';
import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;
const folders: string[] = [];

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  await Promise.all(folders.splice(0).map((made) => rm(made, { recursive: true, force: true })));
  running = undefined;
  current = undefined;
});

const SUM = 'export const sum = (a, b) => a + b;\n';
/** A wall painted on: green whatever sum does. */
const WEAK_TEST = "import { sum } from '../src/sum.mjs';\nif (typeof sum !== 'function') process.exit(1);\n";
/** A wall that stands: red as soon as sum is wrong. */
const STRONG_TEST = "import { sum } from '../src/sum.mjs';\nif (sum(2, 3) !== 5) process.exit(1);\n";
/** Red the second time it runs (a counter outside the plot, `flaky.count`), else a wall that stands. */
const flakyTest = (counter: string) =>
  [
    "import { existsSync, readFileSync, writeFileSync } from 'node:fs';",
    "import { sum } from '../src/sum.mjs';",
    `const file = ${JSON.stringify(counter)};`,
    "const n = existsSync(file) ? Number(readFileSync(file, 'utf8')) + 1 : 1;",
    'writeFileSync(file, String(n));',
    'process.exit(n === 2 || sum(2, 3) !== 5 ? 1 : 0);',
  ].join('\n');

/** Runs the quest's test in `cwd` as the judge's shell would; its exit code. */
const testIn = (cwd: string): number => {
  try {
    execFileSync(process.execPath, ['e2e/sum.test.mjs'], { cwd, stdio: 'ignore' });
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? 1;
  }
};

interface Seen {
  readonly cwd: string;
  readonly request: SpawnRequest;
  readonly branch_head: string;
}

/**
 * The judge of the fake quests: in its cwd it breaks src/sum.mjs, runs the test, restores the file, and fails the
 * quest when the test stayed green (break_and_expect_red); what it saw is kept for the spec.
 */
function judgeIn(repo: string, seen: Seen[]) {
  return async (req: SpawnRequest): Promise<unknown> => {
    const branch = `quest/${req.quest?.id ?? ''}`;
    seen.push({ cwd: req.cwd, request: req, branch_head: git(repo, 'rev-parse', branch) });
    const file = path.join(req.cwd, 'src', 'sum.mjs');
    await writeFile(file, 'export const sum = (a, b) => a - b;\n');
    const red = testIn(req.cwd) !== 0;
    git(req.cwd, 'restore', 'src/sum.mjs');
    if (red) return { result: 'pass' };
    const notes = 'Broke src/sum.mjs:1 (a + b -> a - b): e2e/sum.test.mjs stayed green.';
    return { result: 'fail', fail_kind: 'incomplete', notes };
  };
}

/** The fakes, their assignees leaving `files` in their plot, their judges judging with `judge`. */
function runnersOf(
  kingdom: Bench,
  files: Record<string, string>,
  judge: (req: SpawnRequest) => Promise<unknown>,
) {
  const wrap = (fake: FakeRunner): AgentRunner => ({
    ...fake,
    spawn: async (req) => {
      if (req.role === 'assignee')
        for (const [file, text] of Object.entries(files)) await writeFile(path.join(req.cwd, file), text);
      const session = await fake.spawn(req);
      if (req.role !== 'verifier') return session;
      const structured = await judge(req);
      return { ...session, wait: async () => ({ ...(await session.wait()), structured }) };
    },
  });
  return { claude: wrap(kingdom.fakes.claude), gemini: wrap(kingdom.fakes.gemini) };
}

/** dc1-se-team on a git repo with sum.mjs and an e2e check that runs the quest's test. */
async function open(files: Record<string, string>) {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'elvaria trial repo '));
  folders.push(repo);
  await gitRepoWith(repo, { 'src/sum.mjs': SUM, 'e2e/.keep': '' });
  current = await bench();
  const read = await current.store.territories.read('dc1-se-team' as TerritoryId);
  if (!read.ok) throw new Error('fixture: no territory');
  const e2e = { id: 'e2e', run: 'node e2e/sum.test.mjs', when: ['e2e/**'], timeout_minutes: 1 };
  const territory = {
    ...read.value,
    path: repo.replaceAll('\\', '/'),
    vcs: { type: 'git', default_branch: 'main' },
  };
  await current.store.territories.write(TerritorySchema.parse({ ...territory, checks: [e2e] }));
  const seen: Seen[] = [];
  const runners = runnersOf(current, files, judgeIn(repo, seen));
  running = current.steward({ plots: gitPlots(current.root), runners });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running, repo, seen };
}

/** The first run of the quest has its verdict. */
const judged = (kingdom: Bench, title: string) => async () =>
  (await kingdom.store.verdicts.read(`${(await kingdom.quest(title)).id}-1` as never)).ok;
const verdictOf = async (kingdom: Bench, id: string): Promise<Verdict> => {
  const read = await kingdom.store.verdicts.read(id as never);
  if (!read.ok) throw new Error(`fixture: no verdict ${id}`);
  return read.value;
};
const E2E = { tags: ['e2e'] };

describe('tests as the product: Thả quái thử thành (ADR 0022)', () => {
  it('returns a quest whose test stays green when its judge breaks the code, the branch untouched', async () => {
    const { kingdom, steward, repo, seen } = await open({ 'e2e/sum.test.mjs': WEAK_TEST });
    await kingdom.command('create_quest', questPayload('Wall of paint', E2E));
    await tickUntil(steward, kingdom.clock, judged(kingdom, 'Wall of paint'));
    const quest = await kingdom.quest('Wall of paint');
    const verdict = await verdictOf(kingdom, `${quest.id}-1`);
    expect(verdict).toMatchObject({ ritual: 'mutation_check', result: 'fail', fail_kind: 'incomplete' });
    expect(verdict.checks.map(({ id, pass }) => `${id}:${pass}`)).toEqual([
      'rerun_clean:true',
      'e2e:true',
      'flake_check:true',
    ]);
    // The judge worked in its scratch plot, with Edit and Write and without commit or push.
    const [judge] = seen;
    const scratch = path.join(fromPortable(quest.plot.path ?? ''), '..', scratchIdOf(quest.id));
    expect(path.resolve(judge!.cwd)).toBe(path.resolve(scratch));
    expect(judge!.request.permissions.tools).toEqual(expect.arrayContaining(['Edit', 'Write']));
    expect(judge!.request.permissions.deny).toEqual(
      expect.arrayContaining(['Bash(git commit:*)', 'Bash(git push:*)']),
    );
    expect(judge!.request.permissions.laws.forbidden_commands).toContain(NO_HISTORY_COMMAND);
    expect(judge!.request.prompt.system).toContain('you work in a scratch plot');
    // Nothing of the break reached the branch, and the scratch plot is gone.
    expect(git(repo, 'rev-parse', `quest/${quest.id}`)).toBe(judge!.branch_head);
    expect(git(repo, 'show', `quest/${quest.id}:src/sum.mjs`)).toBe(SUM.trim());
    expect(await pathExists(scratch)).toBe(false);
    expect(['returned', 'working', 'claimed']).toContain(quest.status);
  }, 120_000);

  it('passes a quest whose test goes red on the break, and its branch stays as the assignee left it', async () => {
    const { kingdom, steward, repo, seen } = await open({ 'e2e/sum.test.mjs': STRONG_TEST });
    await kingdom.command('create_quest', questPayload('Wall of stone', E2E));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Wall of stone')).status === 'done',
    );
    const quest = await kingdom.quest('Wall of stone');
    expect(await verdictOf(kingdom, `${quest.id}-1`)).toMatchObject({
      ritual: 'mutation_check',
      result: 'pass',
    });
    expect(git(repo, 'rev-parse', `quest/${quest.id}`)).toBe(seen[0]!.branch_head);
    expect(git(repo, 'show', `quest/${quest.id}:e2e/sum.test.mjs`)).toBe(STRONG_TEST.trim());
  }, 120_000);

  it('fails a quest whose test flakes, whatever its judge says, and opens a fix quest', async () => {
    const counter = path.join(await mkdtemp(path.join(os.tmpdir(), 'elvaria flake ')), 'flaky.count');
    folders.push(path.dirname(counter));
    const { kingdom, steward } = await open({ 'e2e/sum.test.mjs': flakyTest(counter) });
    await kingdom.command('create_quest', questPayload('Wall of fog', E2E));
    await tickUntil(steward, kingdom.clock, judged(kingdom, 'Wall of fog'));
    const quest = await kingdom.quest('Wall of fog');
    const verdict = await verdictOf(kingdom, `${quest.id}-1`);
    expect(verdict).toMatchObject({ result: 'fail', fail_kind: 'flaky' });
    expect(verdict.checks.find(({ id }) => id === 'flake_check')).toMatchObject({ pass: false });
    // Two runs of the machine (green, then red), then the judge's own run on its break.
    expect(await readFile(counter, 'utf8')).toBe('3');
    const fix = (await kingdom.quests()).find((made) => made.parent_id === quest.id);
    expect(fix).toMatchObject({
      kind: 'fix',
      class_required: 'knight',
      title: 'Trừ tà: Wall of fog',
      created_by: 'patrol',
      territory: quest.territory,
      tags: ['e2e'],
    });
    expect(fix?.description).toContain('✗ flake_check');
  }, 120_000);
});
