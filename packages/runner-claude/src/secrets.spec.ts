// Secrets of a session (implementation-plan §3.9, ADR 0013): the treasury value reaches the CLI's env and nothing
// else. The fake CLI prints it, and secrets of known shapes, everywhere it can; Elvaria's real hook (from source:
// Node strips its types, so no build is needed) writes the log and the journal, the runner writes the run folder.
// Afterwards no file of the kingdom holds any of them.
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CONFORMANCE_QUEST, FAKE_SCENARIO_ENV, STDERR_FILE, STDOUT_FILE } from '@elvaria/runner-core';
import type { SpawnRequest } from '@elvaria/runner-core';
import { afterEach, describe, expect, it } from 'vitest';

import { prepare } from './__fixtures__/harness.ts';
import { RM_TEMP } from './__fixtures__/temp.ts';
import { PROMPT_FILE } from './run-files.ts';
import type { HookCommand } from './settings.ts';

/** Elvaria's hook itself, not the stand-in of the other specs: it is the hook that must mask. */
const HOOK_SOURCE = path.resolve(import.meta.dirname, '..', '..', 'hooks', 'src', 'elvaria-hook.ts');
const realHook = (policyFile: string): HookCommand => ({
  command: process.execPath,
  args: [HOOK_SOURCE, '--policy', policyFile],
});

const join = (...parts: string[]): string => parts.join('');
/** The treasury's value for `npm_token`: no pattern knows its shape, only the session's known values. */
const TREASURY_VALUE = join('plain', '-FAKE-', 'treasury-value-77');
/** Shapes the patterns know (redact-patterns.json), put together at run time so no scanner flags the repo. */
const SHAPED = [
  join('gh', 'p_', 'abcdefghijklmnopqrstuvwxyz0123456789'),
  join('sk-', 'ant-', 'api03-', 'FAKE'.repeat(10)),
  join('AK', 'IA', 'FAKEFAKEFAKE1234'),
  [join('ey', 'JhbGciOiJIUzI1NiJ9'), join('ey', 'JzdWIiOiJ0aG9ybiJ9'), 'ZmFrZS1zaWduYXR1cmU'].join('.'),
];
const SECRETS = [TREASURY_VALUE, ...SHAPED];

/** The quest fields the adapter reads: its id, and the treasury names it asked for. */
const QUEST = { id: CONFORMANCE_QUEST, secrets_required: ['npm_token'] } as unknown as NonNullable<
  SpawnRequest['quest']
>;

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
}

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((remove) => remove()));
});

describe('the secrets of a session', () => {
  it('reach the CLI env, and no file of the kingdom: log, journal, run folder', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'elvaria record '));
    const record = path.join(outside, 'record.json');
    const prepared = await prepare(
      'submit',
      { hookCommand: realHook },
      {
        env: {
          NPM_TOKEN: TREASURY_VALUE,
          [FAKE_SCENARIO_ENV]: 'leak',
          FAKE_CLAUDE_LEAK: JSON.stringify(SECRETS),
          FAKE_CLAUDE_RECORD: record,
        },
      },
    );
    cleanup.push(
      () => prepared.workspace.remove(),
      () => rm(outside, RM_TEMP),
    );
    const prompt = { ...prepared.request.prompt, user: `Publish with the token ${TREASURY_VALUE}.` };
    const session = await prepared.runner.spawn({ ...prepared.request, quest: QUEST, prompt });
    const result = await session.wait();
    expect(result.outcome).toBe('completed');

    const seen = JSON.parse(await readFile(record, 'utf8')) as { env: Record<string, string> };
    expect(seen.env.NPM_TOKEN).toBe(TREASURY_VALUE);

    const root = prepared.workspace.root;
    const files = await filesUnder(root);
    const leaks: string[] = [];
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      for (const secret of SECRETS) if (text.includes(secret)) leaks.push(path.relative(root, file));
    }
    expect(leaks).toEqual([]);

    // Each place did hold them, masked: the check above is not vacuous.
    const runDir = prepared.request.run_dir;
    const masked = async (file: string) => (await readFile(file, 'utf8')).includes('[redacted]');
    expect(await masked(path.join(runDir, STDOUT_FILE))).toBe(true);
    expect(await masked(path.join(runDir, STDERR_FILE))).toBe(true);
    expect(await masked(path.join(runDir, PROMPT_FILE))).toBe(true);
    expect(await masked(path.join(root, 'quests', CONFORMANCE_QUEST, 'journal.jsonl'))).toBe(true);
    const days = files.filter((file) => path.relative(root, file).startsWith(`events${path.sep}`));
    expect(days.length).toBeGreaterThan(0);
    const policy = JSON.parse(await readFile(path.join(runDir, 'policy.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(policy.secrets).toEqual(['NPM_TOKEN']);
  });
});
