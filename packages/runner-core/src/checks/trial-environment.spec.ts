import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FLAKE_RUNS, TerritorySchema } from '@elvaria/domain';
import { acquireLock, inKingdom } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { TEST_HOST } from '../__fixtures__/git-repo.ts';
import { exclusiveLockOf, lockBusyLine } from './exclusive-lock.ts';
import { runTrial } from './trial.ts';
import type { TrialRequest } from './trial.ts';

// P1-54, (c) and (f) of the P1-50 report: the trial's resets hold the territory's exclusive lock, a run its
// environment failed is no flake, and flake_check runs again only the checks that may flake, on the specs touched.
let root = '';
let kingdom = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria trial environment '));
  kingdom = path.join(root, 'my kingdom');
  await mkdir(kingdom);
});
afterAll(() => rm(root, RM_TEMP));

/**
 * Counts its runs per name in `../counts`, writes `name n args…` to `../trace.txt`, and on a run listed in FAIL_<NAME>
 * (comma-separated) prints the line in LINE_<NAME> and fails.
 */
const STEP = [
  "import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';",
  'const [name, ...rest] = process.argv.slice(2);',
  "mkdirSync('../counts', { recursive: true });",
  'let n = 1;',
  'try { n = Number(readFileSync(`../counts/${name}`, "utf8")) + 1; } catch {}',
  'writeFileSync(`../counts/${name}`, String(n));',
  "appendFileSync('../trace.txt', [name, n, ...rest].join(' ') + '\\n');",
  "const fails = (readFileSync('../fails.json', 'utf8') && JSON.parse(readFileSync('../fails.json', 'utf8'))[name]) || {};",
  'if ((fails.on ?? []).includes(n)) { console.log(fails.line ?? "expected 3 to be 4"); process.exit(1); }',
  'console.log(`ran ${name} #${n}`);',
].join('\n');

type Fails = Record<string, { on: number[]; line?: string }>;

let cases = 0;
async function plotFolder(fails: Fails = {}) {
  cases += 1;
  const dir = path.join(root, `case ${cases}`, 'plot');
  await mkdir(path.join(dir, 'e2e'), { recursive: true });
  await writeFile(path.join(dir, 'step.mjs'), STEP);
  await writeFile(path.join(dir, '..', 'fails.json'), JSON.stringify(fails));
  const plot = { base: 'BASE', head: 'HEAD', checkout: () => Promise.resolve() };
  const trace = async () => (await readFile(path.join(dir, '..', 'trace.txt'), 'utf8')).trim().split('\n');
  return { dir, plot, trace };
}

const step = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  run: `node step.mjs ${id}`,
  when: ['**'],
  timeout_minutes: 1,
  ...extra,
});

function requestIn(dir: string, fields: { checks?: unknown[]; commands?: unknown } & Partial<TrialRequest>) {
  const { checks = [step('e2e')], commands = { reset: 'node step.mjs reset' }, ...rest } = fields;
  const territory = TerritorySchema.parse({
    version: 1,
    id: 'dc1',
    name: 'dc1',
    path: '/repos/dc1',
    kind: 'code',
    vcs: { type: 'none' },
    checks,
    commands,
  });
  return {
    kingdom,
    territory,
    touched: ['src/a.ts'],
    cwd: dir,
    run_dir: `.runs/q-${cases}`,
    runs: 1,
    coverage: false,
    ...rest,
  };
}

const ids = (runs: readonly { id: string; pass: boolean }[]) => runs.map(({ id, pass }) => `${id}:${pass}`);
const log = (file: string) => readFile(inKingdom(kingdom, file), 'utf8');
const NO_CONTAINER = 'dependency db failed to start: No such container: 3f1c';

describe('runTrial: the reset and the exclusive lock', () => {
  it('runs no reset while another quest keeps the lock, and fails rerun_clean as its environment', async () => {
    const { dir, plot, trace } = await plotFolder();
    const held = await acquireLock(inKingdom(kingdom, exclusiveLockOf('dc1')), { wait: false });
    if (!held.ok) throw new Error('lock');
    try {
      const runs = await runTrial(requestIn(dir, { lock_wait_ms: 200 }), TEST_HOST, plot);
      expect(runs).toMatchObject([
        { id: 'rerun_clean', pass: false, exit_code: null, environment: lockBusyLine('dc1', 200) },
      ]);
      expect(await log(runs[0]!.log_path)).toContain(lockBusyLine('dc1', 200));
      await expect(trace()).rejects.toThrow();
    } finally {
      await held.value.release();
    }
  });

  it('runs the reset once the lock is free, and frees it for the exclusive checks after', async () => {
    const { dir, plot, trace } = await plotFolder();
    const checks = [step('e2e', { exclusive: true })];
    const runs = await runTrial(requestIn(dir, { checks, lock_wait_ms: 200 }), TEST_HOST, plot);
    expect(ids(runs)).toEqual(['rerun_clean:true', 'e2e:true']);
    expect(await trace()).toEqual(['reset 1', 'e2e 1']);
  });

  it("says the reset failed because of its environment when its log shows Docker's line", async () => {
    const { dir, plot } = await plotFolder({
      reset: { on: [1], line: 'Cannot connect to the Docker daemon' },
    });
    const runs = await runTrial(requestIn(dir, {}), TEST_HOST, plot);
    expect(runs).toMatchObject([
      { id: 'rerun_clean', pass: false, environment: 'Cannot connect to the Docker daemon' },
    ]);
  });
});

describe('runTrial: a run its environment failed', () => {
  it('names the environment of a failing check in the first run, and runs nothing again', async () => {
    const { dir, plot, trace } = await plotFolder({ e2e: { on: [1], line: NO_CONTAINER } });
    const runs = await runTrial(requestIn(dir, { runs: FLAKE_RUNS }), TEST_HOST, plot);
    expect(runs).toMatchObject([
      { id: 'rerun_clean', pass: true },
      { id: 'e2e', pass: false, environment: NO_CONTAINER },
    ]);
    expect(await trace()).toEqual(['reset 1', 'e2e 1']);
  });

  it('finds no flake in a rerun its environment failed, says why, and ends its log with that run', async () => {
    const { dir, plot } = await plotFolder({ e2e: { on: [3], line: NO_CONTAINER } });
    const runs = await runTrial(requestIn(dir, { runs: FLAKE_RUNS }), TEST_HOST, plot);
    const flake = runs.find(({ id }) => id === 'flake_check');
    expect(flake).toMatchObject({ pass: false, environment: NO_CONTAINER });
    const said = await log(flake!.log_path);
    expect(said).toContain(`e2e failed because of its environment (${NO_CONTAINER}): no flake can be told`);
    expect(said).toContain(`--- the end of .runs/q-${cases}/run-3/checks/e2e.log ---`);
  });

  it('ends the log of a real flake with the end of the failing run, for the judge', async () => {
    const { dir, plot } = await plotFolder({ e2e: { on: [2] } });
    const runs = await runTrial(requestIn(dir, { runs: FLAKE_RUNS }), TEST_HOST, plot);
    const flake = runs.find(({ id }) => id === 'flake_check');
    expect(flake).toMatchObject({ pass: false });
    expect(flake?.environment).toBeUndefined();
    const said = await log(flake!.log_path);
    expect(said).toContain('flaky: e2e passed in one run and failed in another');
    expect(said).toContain('expected 3 to be 4');
  });

  it('names the environment of coverage that failed on it', async () => {
    const { dir, plot } = await plotFolder({
      cover: { on: [1], line: 'container dc1-e2e-db-1 is unhealthy' },
    });
    const commands = { reset: 'node step.mjs reset', coverage: 'node step.mjs cover' };
    const runs = await runTrial(requestIn(dir, { commands, coverage: true }), TEST_HOST, plot);
    expect(runs.at(-1)).toMatchObject({
      id: 'coverage_not_lower',
      pass: false,
      environment: 'container dc1-e2e-db-1 is unhealthy',
    });
  });
});

describe('runTrial: what flake_check runs again', () => {
  it('runs again only the checks that may flake, once one has `flake`', async () => {
    const { dir, plot, trace } = await plotFolder();
    const checks = [step('lint'), step('e2e', { flake: {} })];
    const runs = await runTrial(requestIn(dir, { checks, runs: FLAKE_RUNS }), TEST_HOST, plot);
    expect(ids(runs)).toEqual(['rerun_clean:true', 'lint:true', 'e2e:true', 'flake_check:true']);
    expect((await trace()).filter((line) => !line.startsWith('reset'))).toEqual([
      'lint 1',
      'e2e 1',
      'e2e 2',
      'e2e 3',
    ]);
  });

  it('runs the spec files the quest touched alone, quoted, when the check names how', async () => {
    const { dir, plot, trace } = await plotFolder();
    await writeFile(path.join(dir, 'e2e', 'my flow.spec.ts'), '');
    await writeFile(path.join(dir, 'e2e', 'leads.spec.ts'), '');
    const flake = { specs: ['e2e/**/*.spec.ts'], run: 'node step.mjs e2e-specs {specs}' };
    const checks = [step('e2e', { flake })];
    const touched = ['e2e/my flow.spec.ts', 'e2e/leads.spec.ts', 'e2e/gone.spec.ts', 'src/a.ts'];
    await runTrial(requestIn(dir, { checks, touched, runs: FLAKE_RUNS }), TEST_HOST, plot);
    expect((await trace()).filter((line) => !line.startsWith('reset'))).toEqual([
      'e2e 1',
      'e2e-specs 1 e2e/my flow.spec.ts e2e/leads.spec.ts',
      'e2e-specs 2 e2e/my flow.spec.ts e2e/leads.spec.ts',
    ]);
  });

  it('runs nothing again when no check that may flake ran', async () => {
    const { dir, plot, trace } = await plotFolder();
    const checks = [step('lint'), step('e2e', { when: ['e2e/**'], flake: {} })];
    const runs = await runTrial(requestIn(dir, { checks, runs: FLAKE_RUNS }), TEST_HOST, plot);
    expect(ids(runs)).toEqual(['rerun_clean:true', 'lint:true']);
    expect(await trace()).toEqual(['reset 1', 'lint 1']);
  });
});
