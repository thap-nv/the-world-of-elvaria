// The Codex tribe's runner of `elvaria run` (P1-12d): built on first use from the Codex doctor pinned, else PATH,
// else the VS Code extension's binary. Only the calls outside a session run here (`--version`, `login status`, the
// app-server's windows), against runner-codex's fake CLI: they cost no mana.
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

  it('says so when doctor pinned none and none is found', async () => {
    const io = testIo({ env: baseEnv(await isolatedPath()), home: dir.root });
    const nowhere = codexRunner(tribeWith(), io);
    await expect(nowhere.doctor()).rejects.toThrow('tribe codex: codex is not pinned and not found');
    await expect(nowhere.probe()).rejects.toThrow('codex is not pinned');
  });
});
