// The sandbox of a Codex session against the real CLI (ELVARIA_LIVE=1, P1-12e). Each fence first, one test each,
// through `codex app-server` → `command/exec` with the very `-c` settings of a writing session: no model, 0 mana.
// Then one session (gpt-6-luna-low, a little of the owner's usage) runs a test repo's `pnpm test` (Vitest, which
// starts workers) and `pnpm build` (a script that spawns esbuild), and a script that tries to write outside.
// The test repo is installed with the pnpm running this spec (npm_execpath): run it as
// `ELVARIA_LIVE=1 pnpm --filter @elvaria/runner-codex test`, after `pnpm --filter @elvaria/hooks build`.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { SPAWN_PROBE_FILE, SPAWN_PROBE_OK, readSpawnProbe, writeSpawnProbe } from '@elvaria/runner-core';
import type { RunResult, SpawnRequest } from '@elvaria/runner-core';

import { TRIBE, minimalEnv, openWorld, request } from './__fixtures__/codex.ts';
import { askAppServer } from './app-server.ts';
import { FEATURES_OFF, configOf } from './args.ts';
import { locateCodex } from './locate.ts';
import { SHELL_POLICY_ENV, createCodexRunner } from './runner.ts';
import type { World } from './__fixtures__/codex.ts';

const LIVE = process.env.ELVARIA_LIVE === '1';
const HOOK_DIST = path.resolve(import.meta.dirname, '..', '..', 'hooks', 'dist', 'elvaria-hook.js');
const MINUTE = 60_000;
/** What a write attempt became: `written`, or the error's code. */
const WRITE = `const tryWrite = (file) => { try { require('node:fs').writeFileSync(file, 'x'); require('node:fs').rmSync(file); return 'written'; } catch (error) { return error.code ?? String(error); } };`;

let codex = '';
beforeAll(async () => {
  if (!LIVE) return;
  codex = process.env.ELVARIA_CODEX ?? (await locateCodex(process.env, process.platform)) ?? '';
});

interface Exec {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** `argv` under the sandbox a writing session on `world` gets, through the app-server: no model call. */
async function sandboxed(world: World, argv: readonly string[]): Promise<Exec> {
  const config = configOf(request(world));
  const args = [
    ...FEATURES_OFF.flatMap((feature) => ['--disable', feature]),
    ...config.flatMap((setting) => ['-c', setting]),
  ];
  const call = { command: argv, cwd: world.plot, timeoutMs: MINUTE };
  const env = { ...minimalEnv(), ...(process.platform === 'win32' ? SHELL_POLICY_ENV : {}) };
  const answer = await askAppServer(
    { command: codex, args: [] },
    args,
    [{ method: 'command/exec', params: call }],
    {
      env,
      cwd: world.plot,
      timeout_ms: 2 * MINUTE,
    },
  );
  if (!answer.ok) throw new Error(answer.problem);
  return answer.results[0] as Exec;
}

/** Each of `files` written (and removed) by a node script under the sandbox: `written`, or why not. */
async function writes(world: World, files: readonly string[]): Promise<string[]> {
  const script = `${WRITE} process.stdout.write(JSON.stringify(${JSON.stringify(files)}.map(tryWrite)));`;
  const ran = await sandboxed(world, [process.execPath, '-e', script]);
  return JSON.parse(ran.stdout) as string[];
}

describe.runIf(LIVE)('live: the fences of a writing session (command/exec, 0 mana)', () => {
  let world: World;
  beforeEach(async () => {
    world = await openWorld();
    await mkdir(path.dirname(world.handover), { recursive: true });
  });
  afterEach(() => world.remove());

  it('writes its plot and its quest folder', { timeout: 3 * MINUTE }, async () => {
    const files = [path.join(world.plot, 'mine.txt'), path.join(path.dirname(world.handover), 'letter.txt')];
    expect(await writes(world, files)).toEqual(['written', 'written']);
  });

  it('writes nothing beside its plot: not the repo, not the kingdom', { timeout: 3 * MINUTE }, async () => {
    const files = [path.join(world.root, 'dc1 repo', 'escape.txt'), path.join(world.root, 'escape.txt')];
    const outcomes = await writes(world, files);
    expect(outcomes.filter((outcome) => outcome === 'written')).toEqual([]);
  });

  it("writes nothing in the machine's temp folder", { timeout: 3 * MINUTE }, async () => {
    const [outcome] = await writes(world, [path.join(tmpdir(), `elvaria-escape-${randomUUID()}.txt`)]);
    expect(outcome).not.toBe('written');
  });

  it("keeps git's folder read-only: no file in .git, no commit", { timeout: 3 * MINUTE }, async () => {
    const init = spawnSync('git', ['init', '-q'], { cwd: world.plot, env: minimalEnv(), encoding: 'utf8' });
    expect(init.status).toBe(0);
    const [outcome] = await writes(world, [path.join(world.plot, '.git', 'escape.txt')]);
    expect(outcome).not.toBe('written');
    const commit = `const r = require('node:child_process').spawnSync('git', ['-c', 'user.name=p', '-c', 'user.email=p@x', 'commit', '--allow-empty', '-qm', 'escape'], { encoding: 'utf8' }); process.stdout.write(String(r.status));`;
    expect((await sandboxed(world, [process.execPath, '-e', commit])).stdout).not.toBe('0');
  });

  it('reaches the network, as the other tribes do', { timeout: 3 * MINUTE }, async () => {
    const script = `fetch('https://registry.npmjs.org/', { method: 'HEAD' }).then((r) => process.stdout.write(String(r.status)), (e) => process.stdout.write(String(e.cause?.code ?? e)));`;
    expect(Number((await sandboxed(world, [process.execPath, '-e', script])).stdout)).toBeLessThan(500);
  });

  it('starts a child process with piped stdio from a command', { timeout: 3 * MINUTE }, async () => {
    await writeSpawnProbe(world.plot);
    await sandboxed(world, [process.execPath, SPAWN_PROBE_FILE]);
    expect(await readSpawnProbe(world.plot)).toBe(SPAWN_PROBE_OK);
  });
});

/** A test repo: Vitest with one spec, a build that spawns esbuild, and a script that tries to write outside. */
async function writeTestRepo(world: World, outside: readonly string[]): Promise<void> {
  const pkg = {
    name: 'codex-sandbox-probe',
    private: true,
    type: 'module',
    scripts: { test: 'vitest run --reporter=json --outputFile=vitest.json', build: 'node build.mjs' },
    devDependencies: { esbuild: '0.25.12', vitest: '5.1.0' },
  };
  const files: Record<string, string> = {
    'package.json': JSON.stringify(pkg, null, 2),
    'src/sum.ts': 'export const sum = (a: number, b: number): number => a + b;\n',
    'src/sum.spec.ts':
      "import { expect, it } from 'vitest';\nimport { sum } from './sum.ts';\n\nit('adds', () => {\n  expect(sum(1, 2)).toBe(3);\n});\n",
    'build.mjs':
      "import { build } from 'esbuild';\n\nawait build({ entryPoints: ['src/sum.ts'], bundle: true, outfile: 'dist/sum.js', platform: 'node', format: 'esm' });\n",
    'escape.cjs': `${WRITE}\nrequire('node:fs').writeFileSync('escape.json', JSON.stringify(${JSON.stringify(outside)}.map(tryWrite)));\n`,
  };
  await mkdir(path.join(world.plot, 'src'), { recursive: true });
  for (const [name, text] of Object.entries(files))
    await writeFile(path.join(world.plot, name), text, 'utf8');
  // Outside the sandbox, as a territory's `setup` runs: the pnpm running this spec, from its store when it can.
  const pnpm = process.env.npm_execpath;
  if (pnpm === undefined)
    throw new Error('run this spec through pnpm: npm_execpath names the pnpm to install with');
  const install = spawnSync(process.execPath, [pnpm, 'install', '--prefer-offline'], {
    cwd: world.plot,
    env: minimalEnv(),
    encoding: 'utf8',
  });
  if (install.status !== 0) throw new Error(`pnpm install failed: ${install.stderr}`);
}

describe.runIf(LIVE)('live: a session builds and tests the territory in its sandbox', () => {
  let world: World;
  beforeEach(async () => {
    world = await openWorld();
  });
  afterEach(() => world.remove());

  it(
    'runs pnpm test (Vitest) and pnpm build (esbuild), and writes nothing outside',
    { timeout: 12 * MINUTE },
    async () => {
      const outside = [
        path.join(world.root, 'escape.txt'),
        path.join(tmpdir(), `elvaria-escape-${randomUUID()}.txt`),
      ];
      await writeTestRepo(world, outside);
      const system = [
        'You are a probe of the Elvaria test suite. Do exactly what you are asked, nothing more.',
        `Before you stop, write your handover letter, the file ${world.handover}: the heading "## Where I am" and one line`,
        'under it saying what you did. Add no other heading.',
      ].join(' ');
      const user =
        'Run these three shell commands exactly once each, in this order, in the folder you are in: pnpm test, then pnpm build, then node escape.cjs. Change no file yourself. Then reply with the single word: done.';
      const req: SpawnRequest = request(
        world,
        {},
        { prompt: { system, user }, budget: { max_turns: 30, max_minutes: 10 } },
      );
      const runner = createCodexRunner({
        tribe: TRIBE,
        launch: { command: codex, args: [] },
        hook: { command: process.execPath, args: ['--conditions=elvaria-dist', HOOK_DIST] },
        env: minimalEnv(),
        timeout_ms: MINUTE,
      });
      const session = await runner.spawn(req);
      const signals: unknown[] = [];
      for await (const signal of session.signals) signals.push(signal);
      const result: RunResult = await session.wait();
      expect(result.outcome).toBe('completed');
      const vitest = JSON.parse(await readFile(path.join(world.plot, 'vitest.json'), 'utf8')) as {
        success: boolean;
        numPassedTests: number;
      };
      expect(vitest).toMatchObject({ success: true, numPassedTests: 1 });
      expect(existsSync(path.join(world.plot, 'dist', 'sum.js'))).toBe(true);
      const escaped = JSON.parse(await readFile(path.join(world.plot, 'escape.json'), 'utf8')) as string[];
      expect(escaped.filter((outcome) => outcome === 'written')).toEqual([]);
      expect(outside.filter((file) => existsSync(file))).toEqual([]);
    },
  );
});
