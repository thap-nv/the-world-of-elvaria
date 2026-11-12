import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { TerritorySchema } from '@elvaria/domain';
import { acquireLock, inKingdom } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { TEST_HOST } from '../__fixtures__/git-repo.ts';
import { lockBusyLine } from './exclusive-lock.ts';
import { exclusiveLockOf, runCheck, runChecks } from './run-checks.ts';
import type { ChecksRequest } from './run-checks.ts';

// P1-54, (c) and (f) of the P1-50 report: a failing check whose log shows its environment failed says so, a short
// check runs before an exclusive one, and a cleanup waits for the territory's exclusive lock.
let root = '';
let kingdom = '';
let plot = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria checks environment '));
  kingdom = path.join(root, 'my kingdom');
  plot = path.join(root, 'Tool - DC1', 'plot');
  await mkdir(plot, { recursive: true });
  // Records that it ran, prints its line, and ends with its code after `wait` ms.
  await writeFile(
    path.join(plot, 'say.mjs'),
    [
      "import { appendFileSync } from 'node:fs';",
      'const [name, code = "0", line = "", wait = "0"] = process.argv.slice(2);',
      "appendFileSync('../trace.txt', `${name}\\n`);",
      'console.log(line);',
      'setTimeout(() => process.exit(Number(code)), Number(wait));',
    ].join('\n'),
  );
});
afterAll(() => rm(root, RM_TEMP));

const request = (checks: unknown[], more: Record<string, unknown> = {}): ChecksRequest => ({
  kingdom,
  territory: TerritorySchema.parse({
    version: 1,
    id: 'dc1',
    name: 'dc1',
    path: '/repos/dc1',
    kind: 'code',
    vcs: { type: 'none' },
    checks,
    ...more,
  }),
  touched: ['apps/web/a.ts'],
  cwd: plot,
  run_dir: '.runs/q_20261112_e1n2v3-1',
});

const say = (id: string, code: number, line: string, extra: Record<string, unknown> = {}) => ({
  id,
  run: `node say.mjs ${id} ${code} "${line}"`,
  when: ['apps/**'],
  timeout_minutes: 1,
  ...extra,
});

const traceFile = () => path.join(root, 'Tool - DC1', 'trace.txt');
const trace = async () => (await readFile(traceFile(), 'utf8')).trim().split('\n');
const log = (logPath: string) => readFile(inKingdom(kingdom, logPath), 'utf8');
const lockOf = () => acquireLock(inKingdom(kingdom, exclusiveLockOf('dc1')), { wait: false });

describe('runChecks: the environment of a failing check', () => {
  it("names the line of the territory's environment_errors that a failing check's log shows", async () => {
    const checks = [
      say('e2e', 1, 'dependency db failed to start: No such container: 3f1c'),
      say('unit', 1, 'expected 3 to be 4'),
      say('lint', 0, 'No such container, and yet it passed'),
    ];
    const runs = await runChecks(request(checks), TEST_HOST);
    expect(runs.map(({ id, environment }) => [id, environment])).toEqual([
      ['e2e', 'dependency db failed to start: No such container: 3f1c'],
      ['unit', undefined],
      ['lint', undefined],
    ]);
  });

  it('names none when the territory clears its environment errors', async () => {
    const checks = [say('e2e', 1, 'container dc1-e2e-api-1 is unhealthy')];
    const [run] = await runChecks(request(checks, { environment_errors: [] }), TEST_HOST);
    expect(run).toMatchObject({ pass: false });
    expect(run?.environment).toBeUndefined();
  });

  it('runs the checks that are not exclusive first, so none waits for the lock', async () => {
    await writeFile(traceFile(), '');
    const checks = [say('e2e', 0, 'up', { exclusive: true }), say('format', 0, 'ok'), say('lint', 0, 'ok')];
    const runs = await runChecks(request(checks), TEST_HOST);
    expect(runs.map(({ id }) => id)).toEqual(['format', 'lint', 'e2e']);
    expect(await trace()).toEqual(['format', 'lint', 'e2e']);
  });

  it('fails an exclusive check whose lock another quest kept, as its environment', async () => {
    const held = await lockOf();
    if (!held.ok) throw new Error('lock');
    try {
      const [run] = await runChecks(request([say('e2e', 0, 'up', { exclusive: true })]), TEST_HOST, {
        lock_wait_ms: 200,
      });
      expect(run).toMatchObject({ id: 'e2e', pass: false, environment: lockBusyLine('dc1', 200) });
      expect(await log(run!.log_path)).toContain(lockBusyLine('dc1', 200));
    } finally {
      await held.value.release();
    }
  });
});

describe('runCheck: the cleanup after a timeout', () => {
  it("waits for the territory's exclusive lock, and says so when another quest keeps it", async () => {
    const run = 'node say.mjs unit 0 slow 5000';
    const given = request([{ ...say('unit', 0, 'slow'), run, cleanup: 'node say.mjs cleanup 0 cleaned' }]);
    const slow = given.territory.checks[0]!;
    await writeFile(traceFile(), '');
    const held = await lockOf();
    if (!held.ok) throw new Error('lock');
    try {
      const stopped = await runCheck(slow, given, TEST_HOST, 300, { lock_wait_ms: 200 });
      expect(stopped).toMatchObject({ timed_out: true, pass: false });
      expect(await log(stopped.log_path)).toContain(`${lockBusyLine('dc1', 200)}: the cleanup did not run`);
      expect(await trace()).toEqual(['unit']);
    } finally {
      await held.value.release();
    }
    const freed = await runCheck(slow, given, TEST_HOST, 300, { lock_wait_ms: 200 });
    expect(await log(freed.log_path)).toContain('cleaned');
  });
});
