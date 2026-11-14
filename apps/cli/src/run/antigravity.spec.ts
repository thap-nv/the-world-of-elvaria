// The Gemini tribe's runner of `elvaria run` (P1-15): built on first use from the agy doctor pinned, or from PATH.
// Only the calls outside a session run here (`--version`, `models`), against a fake agy: they cost no mana.
import path from 'node:path';

import { TribeSchema } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baseEnv, fakeTool, isolatedPath, tempDir, testIo } from '../../test/cli.ts';
import { antigravityRunner } from './antigravity.ts';
import type { TempDir } from '../../test/cli.ts';

const TERMS = '2026-11-07T23:23:54+07:00';

const tribeWith = (fields: Record<string, unknown> = {}) =>
  TribeSchema.parse({
    id: 'gemini',
    adapter: 'antigravity',
    enabled: true,
    max_concurrent: 1,
    pools: { gemini_models: { enabled: true }, claude_gpt_models: { enabled: false } },
    ...fields,
  });

describe('antigravityRunner', () => {
  let dir: TempDir;
  beforeEach(async () => {
    dir = await tempDir();
  });
  afterEach(() => dir.remove());

  it('starts the pinned agy, a Windows shim through Node, and asks it about the login', async () => {
    const agy = await fakeTool(path.join(dir.root, 'pinned'), 'agy', '1.5.3');
    const tool = {
      path: agy.split(path.sep).join('/'),
      version: '1.5.3',
      auth: 'login',
      terms_acknowledged_at: TERMS,
    };
    const runner = antigravityRunner(tribeWith({ tool }), testIo({ env: baseEnv(await isolatedPath()) }));
    expect(runner).toMatchObject({ tribe: 'gemini', adapter: 'antigravity' });
    expect(await runner.doctor()).toMatchObject({ version: '1.5.3', auth_ok: true });
  });

  it('finds agy on PATH when doctor pinned none, and says what is missing', async () => {
    const signedOut = path.join(dir.root, 'signed out');
    await fakeTool(signedOut, 'agy', '1.5.3', 0, { loggedIn: false });
    const onPath = antigravityRunner(tribeWith(), testIo({ env: baseEnv(await isolatedPath(signedOut)) }));
    const info = await onPath.doctor();
    expect(info).toMatchObject({ version: '1.5.3', auth_ok: false });
    expect(info.notes?.map(({ code }) => code)).toEqual([
      'doctor:not_signed_in',
      'doctor:terms_not_acknowledged',
    ]);

    const nowhere = antigravityRunner(tribeWith(), testIo({ env: baseEnv(await isolatedPath()) }));
    await expect(nowhere.doctor()).rejects.toThrow('tribe gemini: agy is not pinned and not on PATH');
    await expect(nowhere.probe()).rejects.toThrow('agy is not pinned');
  });
});
