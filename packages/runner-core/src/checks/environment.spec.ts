import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { TERRITORY_DEFAULTS } from '@elvaria/domain';
import type { CheckId } from '@elvaria/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { lastLinesOf, logEndOf, withEnvironment } from './environment.ts';
import type { CheckRun } from './run-checks.ts';

// The end of a failing check's log against the territory's environment_errors (P1-54).
let kingdom = '';
beforeAll(async () => {
  kingdom = await mkdtemp(path.join(tmpdir(), 'elvaria environment '));
  await mkdir(path.join(kingdom, '.runs'));
});
afterAll(() => rm(kingdom, RM_TEMP));

const failed = (logPath: string): CheckRun => ({
  id: 'e2e' as CheckId,
  pass: false,
  duration_ms: 1,
  log_path: logPath,
  exit_code: 1,
  timed_out: false,
});

describe('logEndOf and withEnvironment', () => {
  it('reads the end of a long log, where Docker says why the stack failed', async () => {
    const noise = `${'x'.repeat(99)}\n`.repeat(1000);
    await writeFile(path.join(kingdom, '.runs', 'long.log'), `${noise}No such container: db\n`);
    const end = await logEndOf(kingdom, '.runs/long.log');
    expect(end.length).toBeLessThan(noise.length);
    expect(end.endsWith('No such container: db\n')).toBe(true);
    const run = await withEnvironment(
      failed('.runs/long.log'),
      kingdom,
      TERRITORY_DEFAULTS.environment_errors,
    );
    expect(run.environment).toBe('No such container: db');
  });

  it('reads nothing of a log that is not there, and leaves a pass, a known line and no pattern as they are', async () => {
    expect(await logEndOf(kingdom, '.runs/none.log')).toBe('');
    const patterns = TERRITORY_DEFAULTS.environment_errors;
    const gone = failed('.runs/none.log');
    expect(await withEnvironment(gone, kingdom, patterns)).toBe(gone);
    const passed = { ...failed('.runs/long.log'), pass: true };
    expect(await withEnvironment(passed, kingdom, patterns)).toBe(passed);
    const said = { ...failed('.runs/long.log'), environment: 'the lock' };
    expect(await withEnvironment(said, kingdom, patterns)).toBe(said);
    expect(await withEnvironment(failed('.runs/long.log'), kingdom)).toEqual(failed('.runs/long.log'));
  });

  it('keeps the last lines of a text, its blank end and its CR dropped', () => {
    expect(lastLinesOf('a\r\nb\r\nc\r\n\r\n', 2)).toBe('b\nc');
  });
});
