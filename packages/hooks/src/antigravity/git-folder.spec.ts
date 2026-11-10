// Git's own folder under the agy branch of the hook (P1-49, (a) of P1-46): agy 1.5.4 wrote `.git/` when nothing said
// no (spike Antigravity §15), so runner-core's policy.json names `.git/**` among `cli_protected_paths` for every
// tribe, and the hook refuses a write tool there, the folder and a worktree's `.git` file alike. Reads, a file beside
// it and a shell line that names it stay with the settings: `.git` is not a forbidden path.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DC1_LAWS } from '../__fixtures__/claude-payloads.ts';
import { tempKingdom } from '../__fixtures__/temp.ts';
import { runHook } from '../run-hook.ts';
import { DEFER_TO_SETTINGS } from './translate.ts';
import type { TempKingdom } from '../__fixtures__/temp.ts';

const NOW = Date.parse('2026-11-10T12:00:00Z');
const PLOT = 'C:/Users/elvaria/dc1-se-team/.elvaria/worktrees/q_20261110_g1t2a3';

let kingdom: TempKingdom;
let policy: string;
beforeEach(async () => {
  kingdom = await tempKingdom();
  policy = path.join(kingdom.runDir, 'policy.json');
  // What runner-core's writePolicyFile writes for an agy session since P1-49.
  const written = { version: 1, laws: DC1_LAWS, cli_protected_paths: ['.git/**'] };
  await writeFile(policy, JSON.stringify(written), 'utf8');
});
afterEach(() => kingdom.remove());

/** agy's PreToolUse decision for one tool call. */
async function decisionFor(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const input = { conversationId: 'c-1', workspacePaths: [PLOT], stepIdx: 1, toolCall: { name, args } };
  const env = kingdom.env();
  const { stdout } = await runHook({
    stdin: JSON.stringify(input),
    env,
    argv: ['PreToolUse', '--policy', policy],
    now: NOW,
  });
  return stdout === '' ? {} : (JSON.parse(stdout) as Record<string, unknown>);
}

describe("agy and git's own folder (P1-49)", () => {
  it.each([
    ['write_to_file', { TargetFile: '.git\\config' }],
    ['write_to_file', { TargetFile: `${PLOT}/.git` }],
    ['edit_file', { Path: 'C:\\Users\\elvaria\\dc1-se-team\\.git\\hooks\\pre-commit' }],
  ])('refuses %s in .git: %j', async (name, args) => {
    const refused = await decisionFor(name, args);
    expect(refused).toMatchObject({ decision: 'deny' });
    expect(refused.reason).toMatch(/^Elvaria rule: .*\(\.git\/\*\*\)/);
  });

  it.each([
    ['write_to_file', { TargetFile: '.gitignore' }],
    ['view_file', { AbsolutePath: `${PLOT}/.git/HEAD` }],
    ['run_command', { CommandLine: 'grep -r --exclude-dir=.git TODO .' }],
  ])('leaves %s to the settings: %j', async (name, args) => {
    expect(await decisionFor(name, args)).toEqual(DEFER_TO_SETTINGS);
  });
});
