// A narrow run of the checks (CM-01, ADR 0032): each check runs its narrow command where it has one, every command gets
// the diff's base in ELVARIA_CHECK_BASE (in its env, never in argv), and a full run is the run before CM-01.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { TerritorySchema } from '@elvaria/domain';
import { inKingdom } from '@elvaria/store';
import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST } from '../__fixtures__/git-repo.ts';
import { runChecks } from './run-checks.ts';
import type { ChecksRequest } from './run-checks.ts';

const BASE = '3f2a9c1e5b7d4a6c8e0f1a2b3c4d5e6f7a8b9c0d';
let root = '';
let kingdom = '';
let plot = '';
let temp: TempDir;
beforeAll(async () => {
  temp = await tempDir('narrow checks');
  root = temp.root;
  kingdom = path.join(root, 'my kingdom');
  plot = path.join(root, 'Tool - Personal', 'plot');
  await mkdir(plot, { recursive: true });
  // Prints which command ran and the base it was given.
  await writeFile(
    path.join(plot, 'say.mjs'),
    "console.log(`${process.argv[2]} base=${process.env.ELVARIA_CHECK_BASE ?? 'none'}`);",
  );
});
afterAll(() => temp.remove());

const request = (more: Partial<ChecksRequest> = {}): ChecksRequest => ({
  kingdom,
  territory: TerritorySchema.parse({
    version: 1,
    id: 'elvaria',
    name: 'Elvaria',
    path: '/repos/elvaria',
    kind: 'code',
    vcs: { type: 'none' },
    checks: [
      {
        id: 'test',
        run: 'node say.mjs whole-suite',
        narrow: ['node say.mjs changed-only'],
        when: ['packages/**'],
        timeout_minutes: 1,
      },
      { id: 'layout', run: 'node say.mjs layout', when: ['packages/**'], timeout_minutes: 1 },
      {
        id: 'docs',
        run: 'node say.mjs docs',
        narrow: 'node say.mjs docs-changed',
        when: ['docs/**'],
        timeout_minutes: 1,
      },
    ],
  }),
  touched: ['packages/domain/src/a.ts'],
  cwd: plot,
  run_dir: '.runs/q_20261123_n4rr0w-1',
  ...more,
});

const logOf = (logPath: string) => readFile(inKingdom(kingdom, logPath), 'utf8');

describe('runChecks in a narrow run', () => {
  it("runs each selected check's narrow command, `run` where it has none, with the base in its env", async () => {
    const runs = await runChecks(request({ mode: 'narrow', base: BASE }), TEST_HOST);
    expect(runs.map(({ id, pass }) => [id, pass])).toEqual([
      ['test', true],
      ['layout', true],
    ]);
    const [test, layout] = await Promise.all(runs.map(({ log_path: logPath }) => logOf(logPath)));
    expect(test).toContain('$ node say.mjs changed-only');
    expect(test).toContain(`changed-only base=${BASE}`);
    expect(test).not.toContain('whole-suite');
    expect(layout).toContain(`layout base=${BASE}`);
  });

  it('runs `run` in a full run, the base still given, and no base without one (a folder plot)', async () => {
    const [full] = await runChecks(request({ base: BASE, run_dir: '.runs/q_20261123_n4rr0w-2' }), TEST_HOST);
    expect(await logOf(full!.log_path)).toContain(`whole-suite base=${BASE}`);
    const [folder] = await runChecks(
      request({ mode: 'narrow', run_dir: '.runs/q_20261123_n4rr0w-3' }),
      TEST_HOST,
    );
    expect(await logOf(folder!.log_path)).toContain('changed-only base=none');
  });
});
