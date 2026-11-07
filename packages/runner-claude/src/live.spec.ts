// Smoke tests with the real Claude Code and the real built hook (implementation-plan §3.7, §3.14): only with
// ELVARIA_LIVE=1, because they spend a little of the owner's mana (a handful of one-word `haiku` sessions).
// Build the hook first: pnpm --filter @elvaria/hooks build.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CONFORMANCE_QUEST,
  conformanceChecks,
  conformanceRequest,
  openWorkspace,
  toolPolicyOf,
} from '@elvaria/runner-core';
import type { ConformanceTarget, SpawnRequest, Workspace } from '@elvaria/runner-core';
import { afterAll, describe, expect, it } from 'vitest';

import { TRIBE, minimalEnv } from './__fixtures__/harness.ts';
import { locateClaude } from './locate.ts';
import { createClaudeRunner } from './runner.ts';

const LIVE = process.env.ELVARIA_LIVE === '1';
/** The built hook of @elvaria/hooks, by path: the adapter's specs may not import that package (§1.3). */
const HOOK_SCRIPT = path.join(import.meta.dirname, '..', '..', 'hooks', 'dist', 'elvaria-hook.js');
const MODEL = 'claude-haiku-5-5';
const TIMEOUT_MS = 180_000;

/** What hookCommand() of @elvaria/hooks returns (packages/hooks/src/index.ts). */
const hookCommand = (policyFile: string) => ({
  command: process.execPath,
  args: ['--conditions=elvaria-dist', HOOK_SCRIPT, '--policy', policyFile],
});

const executable = LIVE
  ? (process.env.ELVARIA_CLAUDE ?? (await locateClaude(process.env, process.platform)))
  : undefined;
const realRunner = () =>
  createClaudeRunner({
    tribe: TRIBE,
    ...(executable === undefined ? {} : { executable }),
    hookCommand,
    hookScript: HOOK_SCRIPT,
    env: minimalEnv(),
  });
const target: ConformanceTarget = {
  name: 'runner-claude with Claude Code',
  createRunner: realRunner,
  live: true,
  model: MODEL,
  env: minimalEnv(),
  timeout_ms: TIMEOUT_MS,
};

const opened: Workspace[] = [];
afterAll(async () => {
  await Promise.all(opened.map((workspace) => workspace.remove()));
});

async function requestFor(
  fields: Partial<SpawnRequest>,
): Promise<{ workspace: Workspace; request: SpawnRequest }> {
  const workspace = await openWorkspace();
  opened.push(workspace);
  const base = conformanceRequest(workspace, 'submit', realRunner(), target);
  return { workspace, request: { ...base, env: { ...base.env, ELVARIA_TZ: 'Asia/Ho_Chi_Minh' }, ...fields } };
}

const journalOf = async (workspace: Workspace) =>
  (await readFile(path.join(workspace.root, 'quests', CONFORMANCE_QUEST, 'journal.jsonl'), 'utf8'))
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line) as { type: string; data: Record<string, unknown> });

describe.runIf(LIVE)('Claude Code itself (ELVARIA_LIVE=1)', () => {
  it('has a built hook to run', () => {
    expect(existsSync(HOOK_SCRIPT), `run pnpm --filter @elvaria/hooks build (${HOOK_SCRIPT})`).toBe(true);
  });

  describe('conformance suite, the checks that burn no mana', () => {
    for (const check of conformanceChecks(target)) {
      it(check.id, { timeout: TIMEOUT_MS }, async () => {
        expect(await check.run(target)).toBe('passed');
      });
    }
  });

  it(
    'blocks Stop with JSON until the letter is written, which the character may do outside the plot',
    { timeout: TIMEOUT_MS },
    async () => {
      const { workspace, request } = await requestFor({
        prompt: {
          system:
            'You are a probe of the Elvaria test suite. Do what you are asked, and what a hook asks of you.',
          user: 'Reply with the single word: done.',
        },
        budget: { max_turns: 8, max_minutes: 3 },
      });
      const session = await realRunner().spawn(request);
      const result = await session.wait();
      const notices = (await journalOf(workspace))
        .filter(({ type }) => type === 'agent.notification')
        .map(({ data }) => data.notification_type);
      expect(notices).toContain('handover_required');
      expect(existsSync(request.handover!), 'the character could not write its letter').toBe(true);
      expect(result.outcome).toBe('completed');
    },
  );

  it('commits without any attribution line', { timeout: TIMEOUT_MS }, async () => {
    const { workspace, request } = await requestFor({ role: 'bard' });
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: workspace.plot, env, encoding: 'utf8' });
    git('init', '--quiet');
    git('config', 'user.email', 'probe@example.invalid');
    git('config', 'user.name', 'Probe');
    git('commit', '--quiet', '--allow-empty', '-m', 'Start');
    await writeFile(path.join(workspace.plot, 'a.txt'), 'a\n');
    const permissions = toolPolicyOf({
      role: 'bard',
      characterClass: {
        tools: { allow: ['Read', 'Bash(git add:*)', 'Bash(git commit:*)', 'Bash(git status:*)'], deny: [] },
      },
    });
    const prompt = {
      system: request.prompt.system,
      user: 'Stage the file a.txt and commit it with the message "Add a". Then reply with the single word: done.',
    };
    const result = await (
      await realRunner().spawn({ ...request, permissions, prompt, budget: { max_turns: 8, max_minutes: 3 } })
    ).wait();
    expect(result.outcome).toBe('completed');
    const message = git('log', '-1', '--format=%B');
    expect(message).toMatch(/Add a/);
    expect(message).not.toMatch(/Co-Authored-By|Generated with|claude\.ai/i);
  });
});
