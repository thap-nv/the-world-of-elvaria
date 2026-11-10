import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { POLICY_FILE, runContextOf } from '@elvaria/runner-core';
import type { Workspace } from '@elvaria/runner-core';
import { afterEach, describe, expect, it } from 'vitest';

import { fakeHookCommand, prepare } from './__fixtures__/harness.ts';
import { AGENTS_FILE, SETTINGS_FILE, bashTimeoutEnv, writeRunFiles } from './run-files.ts';
import { CLAUDE_PROTECTED_PATHS } from './settings.ts';

const opened: Workspace[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((workspace) => workspace.remove()));
});

const readJson = async (file: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;

const APPRENTICE = { max_turns: 30, max_minutes: 5 };

describe('writeRunFiles: the apprentice models (§3.12, P1-17)', () => {
  it('lists no apprentice model, and writes no agents.json, for a character that may start no apprentice', async () => {
    const { workspace, request } = await prepare('submit');
    opened.push(workspace);
    const { files } = await writeRunFiles(request, runContextOf(request), fakeHookCommand, APPRENTICE);
    expect(files.agents).toBeUndefined();
    expect(await readJson(path.join(request.run_dir, POLICY_FILE))).not.toHaveProperty('apprentice_models');
  });

  it('hands the hook the paths Claude Code guards on its own (P1-24, .husky of P1-16)', async () => {
    const { workspace, request } = await prepare('submit');
    opened.push(workspace);
    await writeRunFiles(request, runContextOf(request), fakeHookCommand, APPRENTICE);
    const policy = await readJson(path.join(request.run_dir, POLICY_FILE));
    expect(policy.cli_protected_paths).toEqual(CLAUDE_PROTECTED_PATHS);
    expect(policy.cli_protected_paths).toContain('.husky/**');
  });

  it("cuts the ladder at the character's own model, in policy.json and in the apprentice's description", async () => {
    const { workspace, request: base } = await prepare('submit');
    opened.push(workspace);
    const request = {
      ...base,
      character: { ...base.character, model: 'claude-opus-5-5' },
      permissions: { ...base.permissions, apprentice: { tools: ['Read'] } },
    };
    await writeRunFiles(request, runContextOf(request), fakeHookCommand, APPRENTICE);
    expect(await readJson(path.join(request.run_dir, POLICY_FILE))).toMatchObject({
      apprentice_models: ['haiku', 'sonnet', 'opus'],
    });
    const agents = (await readJson(path.join(request.run_dir, AGENTS_FILE))) as {
      apprentice: { model: string; description: string };
    };
    expect(agents.apprentice.model).toBe('haiku');
    expect(agents.apprentice.description).toContain('`model`: sonnet, opus (no stronger one)');
  });
});

describe('the Bash timeouts of a session (P1-48, P1-35 (j))', () => {
  it("lets a command run as long as the territory's longest check, never shorter than Claude Code's own", () => {
    const own = { BASH_DEFAULT_TIMEOUT_MS: '120000', BASH_MAX_TIMEOUT_MS: '600000' };
    expect(bashTimeoutEnv(undefined)).toEqual(own);
    expect(bashTimeoutEnv({ checks: [] })).toEqual(own);
    expect(bashTimeoutEnv({ checks: [{ timeout_minutes: 1 }] })).toEqual(own);
    const dc1 = { checks: [{ timeout_minutes: 5 }, { timeout_minutes: 30 }] };
    expect(bashTimeoutEnv(dc1)).toEqual({
      BASH_DEFAULT_TIMEOUT_MS: '1800000',
      BASH_MAX_TIMEOUT_MS: '1800000',
    });
  });

  it('puts them in the env of the CLI and in its settings', async () => {
    const { workspace, request } = await prepare('submit');
    opened.push(workspace);
    // The probe's request has no territory: Claude Code's own timeouts, written out.
    const { env } = await writeRunFiles(request, runContextOf(request), fakeHookCommand, APPRENTICE);
    const own = { BASH_DEFAULT_TIMEOUT_MS: '120000', BASH_MAX_TIMEOUT_MS: '600000' };
    expect(env).toMatchObject(own);
    expect((await readJson(path.join(request.run_dir, SETTINGS_FILE))).env).toMatchObject(own);
  });
});
