// What the adapter's specs share: the fake CLI, the real hook run from its source, a throwaway kingdom with a plot
// (a space in its name, like real kingdoms), the minimal env, and a request a knight of the Codex tribe would get.
// The hook is reached by path, not imported: an adapter may not import @elvaria/hooks (§1.3).
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { toolPolicyOf } from '@elvaria/runner-core';
import type { AgentRunner, SpawnRequest } from '@elvaria/runner-core';

import { createCodexRunner } from '../runner.ts';
import type { CodexOptions } from '../runner.ts';

export const FIXTURES = path.resolve(import.meta.dirname, '..', '..', 'fixtures');
export const FAKE_CODEX = path.join(FIXTURES, 'fake-codex.mjs');
/** The hook's source: Node strips its types, so the specs need no build of @elvaria/hooks. */
export const HOOK_SOURCE = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'hooks',
  'src',
  'elvaria-hook.ts',
);
export const QUEST = 'q_20261112_c0dexa';
export const TRIBE = 'codex' as AgentRunner['tribe'];
export const FAKE_HOOK = { command: process.execPath, args: [HOOK_SOURCE] };

/**
 * The minimal env of implementation-plan §3.9, from this machine: never process.env whole. One `PATH`: Windows reads
 * process.env without case, so asking for `Path` too would hand the child two of them.
 */
export function minimalEnv(): Record<string, string> {
  const names = ['PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'SystemRoot'];
  const more = ['ComSpec', 'PATHEXT', 'LANG'];
  return Object.fromEntries(
    [...names, ...more].flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

export function fakeRunner(options: Partial<CodexOptions> = {}): AgentRunner {
  return createCodexRunner({
    tribe: TRIBE,
    launch: { command: process.execPath, args: [FAKE_CODEX] },
    hook: FAKE_HOOK,
    env: minimalEnv(),
    ...options,
  });
}

export interface World {
  readonly root: string;
  readonly plot: string;
  readonly run_dir: string;
  readonly handover: string;
  remove(): Promise<void>;
}

export async function openWorld(): Promise<World> {
  const root = await mkdtemp(path.join(tmpdir(), 'elvaria codex '));
  const plot = path.join(root, 'dc1 repo', '.elvaria', 'worktrees', QUEST);
  const runDir = path.join(root, '.runs', `${QUEST}-1`);
  await Promise.all([mkdir(plot, { recursive: true }), mkdir(runDir, { recursive: true })]);
  return {
    root,
    plot,
    run_dir: runDir,
    handover: path.join(root, 'quests', QUEST, 'handover.md'),
    // A killed tree may hold the plot a moment longer on Windows (EBUSY, EPERM): retry, as the conformance workspace.
    remove: () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
  };
}

export const KNIGHT = {
  tools: { allow: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(git status:*)'], deny: ['WebFetch'] },
};
const LAWS = {
  forbidden_paths: ['infra/secrets/**'],
  read_only_paths: [],
  patch_paths: [],
  forbidden_commands: [],
  read_before_write: [],
  rank_floor: [],
};
export const TERRITORY = {
  laws: LAWS,
  checks: [],
  commands: {},
  vcs: { type: 'git' as const, default_branch: 'main' },
  context_files: ['CLAUDE.md', '.claude/rules/*.md'],
};

/** A knight's request on `world`; `env` adds to the minimal env and the session context. */
export function request(
  world: World,
  env: Record<string, string> = {},
  extra: Partial<SpawnRequest> = {},
): SpawnRequest {
  return {
    role: 'assignee',
    // Only id and model reach Codex; the Steward hands over a whole character.
    character: { id: 'ember', model: 'gpt-6-luna-low' } as SpawnRequest['character'],
    territory: TERRITORY as unknown as NonNullable<SpawnRequest['territory']>,
    cwd: world.plot,
    prompt: { system: '# Who you are\n\nYou are Ember, a Knight.', user: 'Write the release notes.' },
    permissions: toolPolicyOf({
      role: 'assignee',
      characterClass: KNIGHT,
      territory: TERRITORY,
      cli_search: false,
    }),
    budget: { max_turns: 20, max_minutes: 10 },
    env: {
      ...minimalEnv(),
      ELVARIA_KINGDOM: world.root,
      ELVARIA_QUEST: QUEST,
      ELVARIA_ATTEMPT: '1',
      ELVARIA_CHARACTER: 'ember',
      ELVARIA_ROLE: 'assignee',
      ELVARIA_TZ: 'Asia/Ho_Chi_Minh',
      ...env,
    },
    run_dir: world.run_dir,
    handover: world.handover,
    ...extra,
  } satisfies SpawnRequest;
}
