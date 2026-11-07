// The adapter under test, pointed at the fake CLI (fixtures/fake-claude.mjs) and the fake hook
// (fixtures/fake-hook.mjs), in the conformance suite's throwaway kingdoms (folder names with spaces, like real ones).
import path from 'node:path';

import { conformanceRequest, openWorkspace } from '@elvaria/runner-core';
import type {
  AgentRunner,
  ConformanceTarget,
  FakeScenario,
  SpawnRequest,
  Workspace,
} from '@elvaria/runner-core';

import { createClaudeRunner } from '../runner.ts';
import type { ClaudeRunnerOptions } from '../runner.ts';
import type { HookCommand } from '../settings.ts';

export const FIXTURES = path.join(import.meta.dirname, '..', '..', 'fixtures');
export const FAKE_CLAUDE = path.join(FIXTURES, 'fake-claude.mjs');
export const FAKE_HOOK = path.join(FIXTURES, 'fake-hook.mjs');
export const TRIBE = 'claude' as AgentRunner['tribe'];

/** What hookCommand() of @elvaria/hooks returns, with the fake hook in place of the built one. */
export const fakeHookCommand = (policyFile: string): HookCommand => ({
  command: process.execPath,
  args: [FAKE_HOOK, '--policy', policyFile],
});

/** A hook that records nothing: what a broken settings file or a hook that never runs leaves. */
export const silentHookCommand = (): HookCommand => ({ command: process.execPath, args: ['-e', ''] });

const MINIMAL = [
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'ComSpec',
  'TEMP',
  'TMP',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
];

/** The minimal env of §3.9, read from this test process (the Steward's comes from runner-core's minimalEnv). */
export const minimalEnv = (): Record<string, string> =>
  Object.fromEntries(
    MINIMAL.flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );

export const fakeRunner = (options: Partial<ClaudeRunnerOptions> = {}): AgentRunner =>
  createClaudeRunner({
    tribe: TRIBE,
    executable: FAKE_CLAUDE,
    hookCommand: fakeHookCommand,
    hookScript: FAKE_HOOK,
    env: minimalEnv(),
    ...options,
  });

export const fakeTarget = (options: Partial<ClaudeRunnerOptions> = {}): ConformanceTarget => ({
  name: 'runner-claude with fake-claude.mjs',
  createRunner: () => fakeRunner(options),
  env: minimalEnv(),
  // Every fake session starts a Node process, and each hook call another.
  timeout_ms: 20_000,
});

export interface Prepared {
  readonly workspace: Workspace;
  readonly runner: AgentRunner;
  readonly request: SpawnRequest;
}

/** A conformance request for `scenario`, with extra env (FAKE_CLAUDE_*) and request fields. */
export async function prepare(
  scenario: FakeScenario,
  options: Partial<ClaudeRunnerOptions> = {},
  extra: { readonly env?: Record<string, string>; readonly request?: Partial<SpawnRequest> } = {},
): Promise<Prepared> {
  const workspace = await openWorkspace();
  const runner = fakeRunner(options);
  const base = conformanceRequest(workspace, scenario, runner, fakeTarget(options));
  const request = {
    ...base,
    env: { ...base.env, ELVARIA_TZ: 'Asia/Ho_Chi_Minh', ...extra.env },
    ...extra.request,
  };
  return { workspace, runner, request };
}
