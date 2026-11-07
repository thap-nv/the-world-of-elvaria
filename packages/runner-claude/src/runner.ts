// The `claude_code` adapter: Claude Code 2.1.318 headless behind AgentRunner (implementation-plan §3.7, §3.14;
// ADR 0006, 0007). apps/cli builds it from `kingdom.tribes[]` and hands it what this package may not import: the
// hook's command (`hookCommand` and `HOOK_SCRIPT` of @elvaria/hooks) and the minimal env (§3.9).
import { tmpdir } from 'node:os';

import { doctorClaude } from './doctor.ts';
import { NOT_FOUND } from './doctor.ts';
import { launchOf } from './launch.ts';
import { locateClaude } from './locate.ts';
import { probeClaude } from './probe.ts';
import { startSession } from './session.ts';
import type { ApprenticeConfig } from './agents.ts';
import type { HookCommand } from './settings.ts';
import type { AgentRunner } from '@elvaria/runner-core';

export const CLAUDE_CODE_ADAPTER = 'claude_code';

/**
 * Everything the contract asks for (§3.14): `-p` with stream-json, CLAUDE.md, hooks, deny rules and the
 * PreToolUse gate, `modelUsage` and `rate_limit_event`, `--json-schema`, `--resume`, compaction hooks, and an
 * apprentice whose `maxTurns` holds (spike P1-02).
 */
export const CLAUDE_CAPABILITIES: AgentRunner['capabilities'] = {
  headless: true,
  context_file: true,
  events: true,
  tool_gate: true,
  usage: true,
  structured_output: true,
  resume: true,
  compact: true,
  subagent: true,
};

/** `BREAKER_DEFAULTS.subagent_max_turns` of the domain, which the adapter may not import. */
const DEFAULT_APPRENTICE: ApprenticeConfig = { model: 'haiku', max_turns: 30 };
const DEFAULT_PROBE_MODEL = 'haiku';
/** `--version`, `auth status`, `/usage` (≈ 4 s) and the ping (≈ 4 s), with room for a slow machine. */
const SHORT_CALL_MS = 60_000;

export interface ClaudeRunnerOptions {
  readonly tribe: AgentRunner['tribe'];
  /** `tribes[].tool.path`; when absent, found as `elvaria doctor` would (locate.ts). */
  readonly executable?: string;
  /** `hookCommand` of @elvaria/hooks: the hook in the exec form, with `--policy <run_dir>/policy.json`. */
  readonly hookCommand: (policyFile: string) => HookCommand;
  /** `HOOK_SCRIPT` of @elvaria/hooks, so doctor can say it is not built. */
  readonly hookScript: string;
  /** The minimal env (§3.9) for doctor and probe; a session gets SpawnRequest.env instead. */
  readonly env: Readonly<Record<string, string>>;
  /** The apprentice's model and `kingdom.breakers.subagent_max_turns`. */
  readonly apprentice?: ApprenticeConfig;
  readonly probeModel?: string;
  /** cwd of doctor and probe, which need no plot; the system temp folder by default. */
  readonly workDir?: string;
  readonly platform?: NodeJS.Platform;
  /** The Node that runs an npm shim's script; this process's by default. */
  readonly nodePath?: string;
  readonly timeoutMs?: number;
}

const withoutGit = (env: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(env).filter(([name]) => !name.startsWith('GIT_')));

export function createClaudeRunner(options: ClaudeRunnerOptions): AgentRunner {
  const nodePath = options.nodePath ?? process.execPath;
  const env = withoutGit(options.env);
  const cwd = options.workDir ?? tmpdir();
  const timeoutMs = options.timeoutMs ?? SHORT_CALL_MS;
  let found: Promise<string | undefined> | undefined;
  const executable = () =>
    (found ??=
      options.executable === undefined
        ? locateClaude(env, options.platform ?? process.platform)
        : Promise.resolve(options.executable));
  const launch = async () => {
    const file = await executable();
    if (file === undefined) throw new Error(NOT_FOUND);
    return launchOf(file, nodePath);
  };
  return {
    tribe: options.tribe,
    adapter: CLAUDE_CODE_ADAPTER,
    capabilities: CLAUDE_CAPABILITIES,
    spawn: async (req) =>
      startSession(
        {
          launch: await launch(),
          hookCommand: options.hookCommand,
          apprentice: options.apprentice ?? DEFAULT_APPRENTICE,
        },
        req,
      ),
    probe: async () => {
      const model = options.probeModel ?? DEFAULT_PROBE_MODEL;
      try {
        return await probeClaude({ launch: await launch(), env, cwd, model, timeoutMs, now: Date.now });
      } catch (error) {
        return { status: 'error', detail: error instanceof Error ? error.message : String(error) };
      }
    },
    doctor: async () =>
      doctorClaude({
        executable: await executable(),
        nodePath,
        hookScript: options.hookScript,
        env,
        cwd,
        timeoutMs,
      }),
  };
}
