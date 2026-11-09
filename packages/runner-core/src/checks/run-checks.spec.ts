import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { TerritorySchema } from '@elvaria/domain';
import { acquireLock, inKingdom } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST } from '../__fixtures__/git-repo.ts';
import { exclusiveLockOf, runCheck, runChecks, toVerdictCheck } from './run-checks.ts';
import type { ChecksRequest } from './run-checks.ts';

let root = '';
let kingdom = '';
let plot = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria checks '));
  kingdom = path.join(root, 'my kingdom');
  plot = path.join(root, 'Tool - DC1', 'plot');
  await mkdir(plot, { recursive: true });
  // Each script records when it ran, so the specs can see order and overlap.
  await writeFile(
    path.join(plot, 'step.mjs'),
    [
      "import { appendFileSync } from 'node:fs';",
      'const [name, code = "0", wait = "0"] = process.argv.slice(2);',
      "appendFileSync('../trace.txt', `start ${name}\\n`);",
      'console.log(`ran ${name}`);',
      'setTimeout(() => {',
      "  appendFileSync('../trace.txt', `end ${name}\\n`);",
      '  process.exit(Number(code));',
      '}, Number(wait));',
    ].join('\n'),
  );
}, 30_000);
afterAll(() => rm(root, { recursive: true, force: true }));

const territoryWith = (checks: unknown[]) =>
  TerritorySchema.parse({
    version: 1,
    id: 'dc1',
    name: 'dc1',
    path: '/repos/dc1',
    kind: 'code',
    vcs: { type: 'none' },
    checks,
  });

const request = (
  checks: unknown[],
  touched: string[],
  runDir = '.runs/q_20261107_a1b2c3-1',
): ChecksRequest => ({
  kingdom,
  territory: territoryWith(checks),
  touched,
  cwd: plot,
  run_dir: runDir,
});

const trace = () =>
  readFile(path.join(root, 'Tool - DC1', 'trace.txt'), 'utf8').then((text) => text.split('\n'));
const resetTrace = () => writeFile(path.join(root, 'Tool - DC1', 'trace.txt'), '');
const log = (logPath: string) => readFile(inKingdom(kingdom, logPath), 'utf8');

describe('runChecks', () => {
  it('runs the selected checks one after another and writes each log in the run folder', async () => {
    await resetTrace();
    const checks = [
      { id: 'lint', run: 'node step.mjs lint', when: ['**/*.ts'], timeout_minutes: 1 },
      { id: 'docs', run: 'node step.mjs docs', when: ['docs/**'], timeout_minutes: 1 },
      { id: 'unit', run: 'node step.mjs unit 1', when: ['src/**'], timeout_minutes: 1 },
    ];
    const runs = await runChecks(request(checks, ['src/app.ts']), TEST_HOST);

    expect(runs.map(({ id, pass, exit_code, timed_out }) => ({ id, pass, exit_code, timed_out }))).toEqual([
      { id: 'lint', pass: true, exit_code: 0, timed_out: false },
      { id: 'unit', pass: false, exit_code: 1, timed_out: false },
    ]);
    expect(runs[0]!.log_path).toBe('.runs/q_20261107_a1b2c3-1/checks/lint.log');
    expect(await log(runs[0]!.log_path)).toBe('$ node step.mjs lint\nran lint\n');
    expect(await trace()).toEqual(['start lint', 'end lint', 'start unit', 'end unit', '']);
    expect(toVerdictCheck(runs[1]!)).toEqual({
      id: 'unit',
      pass: false,
      duration_ms: runs[1]!.duration_ms,
      log_path: '.runs/q_20261107_a1b2c3-1/checks/unit.log',
    });
  }, 30_000);

  it("runs a check's commands in order until one fails, as CI's && does (P1-20)", async () => {
    await resetTrace();
    const drift = ['node step.mjs gen', 'node step.mjs diff 1', 'node step.mjs never'];
    const checks = [{ id: 'openapi', run: drift, when: ['**/*.ts'], timeout_minutes: 1 }];
    const [run] = await runChecks(request(checks, ['src/a.ts']), TEST_HOST);
    expect(run).toMatchObject({ id: 'openapi', pass: false, exit_code: 1 });
    expect(await trace()).toEqual(['start gen', 'end gen', 'start diff', 'end diff', '']);
    const text = await log(run!.log_path);
    expect(text.startsWith('$ node step.mjs gen\nran gen')).toBe(true);
    expect(text).toContain('\n$ node step.mjs diff 1\nran diff');
    expect(text).not.toContain('never');
    await resetTrace();
    const both = [
      { id: 'both', run: ['node step.mjs a', 'node step.mjs b'], when: ['**'], timeout_minutes: 1 },
    ];
    expect(await runChecks(request(both, ['x']), TEST_HOST)).toMatchObject([{ pass: true }]);
    expect(await trace()).toEqual(['start a', 'end a', 'start b', 'end b', '']);
  });

  it('fails a check that cannot run, with the reason in its log', async () => {
    const checks = [
      { id: 'piped', run: 'pnpm test | tee out.log', when: ['**'], timeout_minutes: 1 },
      { id: 'docker', run: 'docker compose up', when: ['**'], timeout_minutes: 1 },
    ];
    const host = {
      ...TEST_HOST,
      resolve: (name: string) => (name === 'docker' ? Promise.resolve(undefined) : TEST_HOST.resolve(name)),
    };
    const runs = await runChecks(request(checks, ['a.md']), host);

    expect(runs.map(({ id, pass, exit_code }) => ({ id, pass, exit_code }))).toEqual([
      { id: 'piped', pass: false, exit_code: null },
      { id: 'docker', pass: false, exit_code: null },
    ]);
    expect(await log(runs[0]!.log_path)).toContain('cannot run this command (shell_syntax');
    expect(await log(runs[1]!.log_path)).toContain('cannot run this command (not_found: docker)');
  });

  it('never runs two exclusive checks of a territory at once, across quests', async () => {
    await resetTrace();
    const e2e = (name: string) => [
      { id: 'e2e', run: `node step.mjs ${name} 0 400`, when: ['**'], exclusive: true, timeout_minutes: 1 },
    ];
    const [first, second] = await Promise.all([
      runChecks(request(e2e('one'), ['x.ts'], '.runs/q_20261107_b2c3d4-1'), TEST_HOST),
      runChecks(request(e2e('two'), ['x.ts'], '.runs/q_20261107_c3d4e5-1'), TEST_HOST),
    ]);

    expect([first[0]!.pass, second[0]!.pass]).toEqual([true, true]);
    const lines = (await trace()).filter((line) => line !== '');
    expect(lines).toHaveLength(4);
    // Whoever started first ended before the other started.
    expect(lines[1]!.replace('end ', '')).toBe(lines[0]!.replace('start ', ''));
  }, 60_000);

  it('waits for the exclusive lock, and fails the check when it is never freed', async () => {
    const target = inKingdom(kingdom, exclusiveLockOf('dc1'));
    const held = await acquireLock(target, { wait: false });
    if (!held.ok) throw new Error('lock taken');
    const e2e = [{ id: 'e2e', run: 'node step.mjs late', when: ['**'], exclusive: true, timeout_minutes: 1 }];

    const refused = await runChecks(request(e2e, ['x.ts']), TEST_HOST, { lock_wait_ms: 0 });
    expect(refused[0]).toMatchObject({ pass: false, exit_code: null, duration_ms: 0 });
    // The wait may come with the request too (P1-20: the Steward's exclusiveWaitMinutes).
    const asked = await runChecks({ ...request(e2e, ['x.ts']), lock_wait_ms: 0 }, TEST_HOST);
    expect(asked[0]).toMatchObject({ pass: false, exit_code: null, duration_ms: 0 });
    expect(await log(refused[0]!.log_path)).toContain('another quest kept the exclusive checks of dc1');

    // Nobody waits any more (P1-25): the wait for the lock ends without the check.
    const stopping = new AbortController();
    setTimeout(() => {
      stopping.abort();
    }, 300);
    const given = runChecks({ ...request(e2e, ['x.ts']), signal: stopping.signal }, TEST_HOST, {
      lock_wait_ms: 20_000,
    });
    expect((await given)[0]).toMatchObject({ pass: false, exit_code: null });

    setTimeout(() => void held.value.release(), 300);
    const waited = await runChecks(request(e2e, ['x.ts']), TEST_HOST, { lock_wait_ms: 20_000 });
    expect(waited[0]).toMatchObject({ pass: true, exit_code: 0 });
  }, 60_000);

  it('kills the running check and starts no other when its signal aborts (P1-25)', async () => {
    await resetTrace();
    const checks = [
      { id: 'slow', run: 'node step.mjs slow 0 60000', when: ['**'], timeout_minutes: 5 },
      { id: 'after', run: 'node step.mjs after', when: ['**'], timeout_minutes: 1 },
    ];
    const stopping = new AbortController();
    setTimeout(() => {
      stopping.abort();
    }, 500);
    const started = Date.now();
    const runs = await runChecks(
      { ...request(checks, ['x.ts'], '.runs/q_20261107_s7o8p9-1'), signal: stopping.signal },
      TEST_HOST,
    );
    expect(Date.now() - started).toBeLessThan(30_000);
    expect(runs).toEqual([
      expect.objectContaining({ id: 'slow', pass: false, exit_code: null, timed_out: false }),
    ]);
    expect(await log(runs[0]!.log_path)).toContain('elvaria: stopped before its end');
    expect(await trace()).not.toContain('start after');
  }, 60_000);
});

describe('runCheck', () => {
  it('stops a check at its timeout, then runs its cleanup into the same log', async () => {
    const [check] = territoryWith([
      {
        id: 'stack',
        run: 'node step.mjs hang 0 60000',
        when: ['**'],
        timeout_minutes: 1,
        cleanup: 'node step.mjs cleanup',
      },
    ]).checks;
    const run = await runCheck(check!, request([], []), TEST_HOST, 500);

    expect(run).toMatchObject({ id: 'stack', pass: false, exit_code: null, timed_out: true });
    expect(await log(run.log_path)).toBe(
      '$ node step.mjs hang 0 60000\nran hang\n\nelvaria: stopped after 500 ms\n\n$ node step.mjs cleanup\nran cleanup\n',
    );
  }, 30_000);
});
