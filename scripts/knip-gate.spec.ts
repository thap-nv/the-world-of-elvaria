// The `pnpm knip` gate (AH-01, architecture-health V1, K1, K12): a throwaway workspace with the repo's own knip.json
// and the two commands of the root `knip` script, so the spec fails when either drifts from what it proves. The
// temp folder's name has a space (implementation-plan §6).
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { toolEnv } from './check-changed.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const KNIP = path.join(REPO, 'node_modules', 'knip', 'bin', 'knip.js');
// A runner package: knip.json gives it a test-side entry (fixtures/*.mjs) without vitest in the throwaway workspace.
const DEMO = 'packages/runner-demo';

/** The root `knip` script, one argv per `&&` step: `knip` itself, then its flags. */
async function gateSteps(): Promise<string[][]> {
  const manifest = JSON.parse(await readFile(path.join(REPO, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const steps = (manifest.scripts.knip ?? '').split('&&').map((step) => step.trim().split(/\s+/));
  for (const step of steps) expect(step[0]).toBe('knip');
  return steps.map((step) => step.slice(1));
}

const GREET = 'export const greet = (name: string): string => `hi ${name}`;\n';

let dir = '';

/** Writes `files` (repo-relative, `/` separated) over a clean one-package workspace. */
async function workspace(files: Record<string, string>): Promise<void> {
  const base: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'knip-gate-fixture', private: true, type: 'module' }),
    'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
    [`${DEMO}/package.json`]: JSON.stringify({
      name: '@fixture/demo',
      type: 'module',
      exports: { '.': './src/index.ts' },
    }),
    [`${DEMO}/src/index.ts`]: "export { greet } from './greet.ts';\n",
    [`${DEMO}/src/greet.ts`]: GREET,
  };
  for (const [name, text] of Object.entries({ ...base, ...files })) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await writeFile(path.join(dir, name), text);
  }
  await copyFile(path.join(REPO, 'knip.json'), path.join(dir, 'knip.json'));
}

/** Each step of the gate in the workspace, in order, as `pnpm knip` runs them (an `&&` chain). */
async function gate(): Promise<{ status: number | null; output: string }[]> {
  const runs = [];
  for (const args of await gateSteps()) {
    const run = spawnSync(process.execPath, [KNIP, ...args], {
      cwd: dir,
      env: toolEnv(),
      encoding: 'utf8',
      shell: false,
    });
    runs.push({ status: run.status, output: `${run.stdout}${run.stderr}` });
  }
  return runs;
}

describe('pnpm knip', () => {
  let temp: TempDir;
  beforeEach(async () => {
    temp = await tempDir('knip gate');
    dir = temp.root;
  });
  afterEach(() => temp.remove());

  it('runs the default mode, then the production mode', async () => {
    const steps = await gateSteps();
    expect(steps).toHaveLength(2);
    expect(steps[0]).not.toContain('--production');
    expect(steps[1]).toContain('--production');
  });

  it('passes a workspace where every file and export is used', async () => {
    await workspace({});
    expect((await gate()).map((run) => run.status)).toEqual([0, 0]);
  });

  it('fails on a file nothing imports', async () => {
    await workspace({ [`${DEMO}/src/orphan.ts`]: 'export const lost = 1;\n' });
    const [first] = await gate();
    expect(first?.status).toBe(1);
    expect(first?.output).toContain(`${DEMO}/src/orphan.ts`);
  });

  it('fails on an export nothing imports', async () => {
    await workspace({
      [`${DEMO}/src/greet.ts`]: `${GREET}export const shout = (name: string): string => name;\n`,
    });
    const [first] = await gate();
    expect(first?.status).toBe(1);
    expect(first?.output).toContain('shout');
  });

  it('fails in production mode on an export only test code imports, unless it is tagged @internal', async () => {
    const fake = "import { echo } from '../src/greet.ts';\n\necho('x');\n";
    const helper = 'export const echo = (text: string): string => text;\n';
    await workspace({ [`${DEMO}/src/greet.ts`]: `${GREET}${helper}`, [`${DEMO}/fixtures/fake.mjs`]: fake });
    const [test, production] = await gate();
    expect(test?.status).toBe(0);
    expect(production?.status).toBe(1);
    expect(production?.output).toContain('echo');

    await workspace({
      [`${DEMO}/src/greet.ts`]: `${GREET}/** @internal */\n${helper}`,
      [`${DEMO}/fixtures/fake.mjs`]: fake,
    });
    expect((await gate()).map((run) => run.status)).toEqual([0, 0]);
  });
});
