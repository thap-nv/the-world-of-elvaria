// The Codex tribe's runner of `elvaria run` (P1-12d): built on first use from the Codex doctor pinned, else PATH,
// else the VS Code extension's binary. Only the calls outside a session run here (`--version`, `login status`, the
// app-server's windows), against runner-codex's fake CLI: they cost no mana. A tribe's `tool.config_dir` reaches the
// adapter as this machine's path (PS-27c).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { TribeSchema } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baseEnv, isolatedPath, tempDir, testIo } from '../../test/cli.ts';
import { codexRunner } from './codex.ts';
import type { TempDir } from '../../test/cli.ts';

const FAKE_CODEX = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'runner-codex',
  'fixtures',
  'fake-codex.mjs',
);

const tribeWith = (fields: Record<string, unknown> = {}) =>
  TribeSchema.parse({ id: 'codex', adapter: 'codex_cli', enabled: true, max_concurrent: 1, ...fields });

describe('codexRunner', () => {
  let dir: TempDir;
  beforeEach(async () => {
    dir = await tempDir();
  });
  afterEach(() => dir.remove());

  it('starts the pinned Codex, a script through Node, and reads its login and windows', async () => {
    const tool = { path: FAKE_CODEX.split(path.sep).join('/'), version: '0.167.0-alpha.4.1', auth: 'login' };
    const runner = codexRunner(tribeWith({ tool }), testIo({ env: baseEnv(await isolatedPath()) }));
    expect(runner).toMatchObject({ tribe: 'codex', adapter: 'codex_cli' });
    expect(runner.capabilities).toMatchObject({ tool_gate: true, search: false });
    expect(await runner.doctor()).toMatchObject({ version: '0.167.0-alpha.4.1', auth_ok: true });
    expect(await runner.probe()).toMatchObject({ status: 'ok' });
  });

  it("runs Codex in the tribe's home, in this machine's path form: its doctor and its own gauge (PS-27c)", async () => {
    const home = path.join(dir.root, 'accounts', 'codex_2');
    await mkdir(home, { recursive: true });
    await writeFile(path.join(home, 'auth.json'), '{}');
    const primary = { usedPercent: 12, windowDurationMins: 300, resetsAt: 1794502073 };
    await writeFile(path.join(home, 'fake-rate-limits.json'), JSON.stringify({ rateLimits: { primary } }));
    const tool = { path: FAKE_CODEX.split(path.sep).join('/'), version: '0.167.0-alpha.4.1', auth: 'login' };
    const tribe = tribeWith({ tool: { ...tool, config_dir: home.split(path.sep).join('/') } });
    const runner = codexRunner(tribe, testIo({ env: baseEnv(await isolatedPath()) }));
    expect(await runner.doctor()).toMatchObject({ auth_ok: true, config_dir: home });
    expect((await runner.probe()).windows).toMatchObject([{ window: 'five_hour', used_pct: 12 }]);
  });

  it('says so when doctor pinned none and none is found', async () => {
    const io = testIo({ env: baseEnv(await isolatedPath()), home: dir.root });
    const nowhere = codexRunner(tribeWith(), io);
    await expect(nowhere.doctor()).rejects.toThrow('tribe codex: codex is not pinned and not found');
    await expect(nowhere.probe()).rejects.toThrow('codex is not pinned');
  });
});
