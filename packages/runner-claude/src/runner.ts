// The `claude_code` adapter: Claude Code 2.1.318 headless behind AgentRunner (implementation-plan §3.7, §3.14;
// ADR 0006, 0007). apps/cli builds it from `kingdom.tribes[]` and hands it what this package may not import: the
// hook's command (`hookCommand` and `HOOK_SCRIPT` of @elvaria/hooks) and the minimal env (§3.9).
import { doctorClaude } from './doctor.ts';
import { purgeWorktree } from './forget.ts';
import { probeClaude } from './probe.ts';
import { startSession } from './session.ts';
import { claudeTool } from './tool.ts';
import type { ApprenticeConfig } from './agents.ts';
import type { HookCommand } from './settings.ts';
import type { ClaudeToolOptions } from './tool.ts';
import type { AgentRunner, ForgetWorktree } from '@elvaria/runner-core';

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
  // The owner's claude.ai sign-in: the runner never puts an API key into the session's env (P1-19).
  auth: ['login'],
};

/** `BREAKER_DEFAULTS.subagent_max_turns` and `subagent_max_minutes` of the domain, which the adapter may not import. */
const DEFAULT_APPRENTICE: ApprenticeConfig = { max_turns: 30, max_minutes: 5 };
const DEFAULT_PROBE_MODEL = 'haiku';

export interface ClaudeRunnerOptions extends ClaudeToolOptions {
  readonly tribe: AgentRunner['tribe'];
  /** `hookCommand` of @elvaria/hooks: the hook in the exec form, with `--policy <run_dir>/policy.json`. */
  readonly hookCommand: (policyFile: string) => HookCommand;
  /** `HOOK_SCRIPT` of @elvaria/hooks, so doctor can say it is not built. */
  readonly hookScript: string;
  /** `kingdom.breakers.subagent_max_turns` and `subagent_max_minutes`; the models are this adapter's. */
  readonly apprentice?: ApprenticeConfig;
  readonly probeModel?: string;
  /** Epoch ms, for doctor's sign-in warning; Date.now by default. */
  readonly now?: () => number;
}

export function createClaudeRunner(options: ClaudeRunnerOptions): AgentRunner {
  const tool = claudeTool(options);
  const { env, cwd, timeoutMs, nodePath } = tool;
  const now = options.now ?? Date.now;
  const apprentice = options.apprentice ?? DEFAULT_APPRENTICE;
  return {
    tribe: options.tribe,
    adapter: CLAUDE_CODE_ADAPTER,
    capabilities: CLAUDE_CAPABILITIES,
    spawn: async (req) =>
      startSession({ launch: await tool.launch(), hookCommand: options.hookCommand, apprentice }, req),
    probe: async (probeOptions = {}) => {
      const model = options.probeModel ?? DEFAULT_PROBE_MODEL;
      try {
        const deps = { launch: await tool.launch(), env, cwd, model, timeoutMs, now };
        return await probeClaude(deps, probeOptions);
      } catch (error) {
        return { status: 'error', detail: error instanceof Error ? error.message : String(error) };
      }
    },
    doctor: async () =>
      doctorClaude({
        executable: await tool.executable(),
        nodePath,
        hookScript: options.hookScript,
        env,
        cwd,
        timeoutMs,
        now,
      }),
  };
}

/**
 * The `forget` of PlotManager.release for this tribe (§3.3, P1-07): Claude Code drops the transcripts it kept for
 * a removed worktree. The CLI touches `~/.claude`, Elvaria never does.
 */
export function createClaudeForget(options: ClaudeToolOptions): ForgetWorktree {
  const tool = claudeTool(options);
  return async (worktree) => {
    await purgeWorktree(await tool.launch(), worktree, tool);
  };
}
