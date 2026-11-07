// The runners the Steward is given (implementation-plan §3.7, §3.14, ADR 0021): one per enabled tribe, built from
// `kingdom.tribes[].adapter`. Only this composition root names a CLI; a tribe whose adapter has no runner yet
// takes no quest. The hook's command comes from @elvaria/hooks, which the adapters may not import (§1.3).
import { HOOK_SCRIPT, hookCommand } from '@elvaria/hooks';
import { createClaudeForget, createClaudeRunner } from '@elvaria/runner-claude';
import type { Kingdom, Tribe, TribeId } from '@elvaria/domain';
import type { ClaudeToolOptions } from '@elvaria/runner-claude';
import type { AgentRunner, ForgetWorktree } from '@elvaria/runner-core';
import { fromPortable } from '@elvaria/store';

import { minimalEnv } from '../process/minimal-env.ts';
import type { CliIo } from '../io.ts';

/** One tribe's runner and what its CLI must forget when a worktree is released (§3.3). */
interface Hand {
  readonly runner: AgentRunner;
  readonly forget?: ForgetWorktree;
}

type AdapterFactory = (tribe: Tribe, kingdom: Kingdom, io: CliIo) => Hand;

/** How to reach a tribe's CLI: the path `elvaria doctor` pinned, else the adapter's own search. */
export function toolOptionsOf(tribe: Tribe, io: CliIo): ClaudeToolOptions {
  return {
    ...(tribe.tool === undefined ? {} : { executable: fromPortable(tribe.tool.path, io.platform) }),
    env: minimalEnv(io.env),
    platform: io.platform,
    nodePath: io.nodePath,
  };
}

const claudeCode: AdapterFactory = (tribe, kingdom, io) => {
  const tool = toolOptionsOf(tribe, io);
  return {
    runner: createClaudeRunner({
      ...tool,
      tribe: tribe.id,
      hookCommand,
      hookScript: HOOK_SCRIPT,
      // The apprentice's models and their order are the adapter's; the character picks one per call (§3.12).
      apprentice: {
        max_turns: kingdom.breakers.subagent_max_turns,
        max_minutes: kingdom.breakers.subagent_max_minutes,
      },
    }),
    forget: createClaudeForget(tool),
  };
};

/** Built-in adapters with a runner today; antigravity (P1-12b), gemini_cli, codex_cli and owner files come later. */
export const ADAPTER_FACTORIES: Readonly<Record<string, AdapterFactory>> = { claude_code: claudeCode };

export interface Crew {
  readonly runners: Partial<Record<TribeId, AgentRunner>>;
  readonly forget: readonly ForgetWorktree[];
  /** Enabled tribes whose adapter has no runner yet: they take no work. */
  readonly idle: readonly Tribe[];
}

export function crewOf(kingdom: Kingdom, io: CliIo): Crew {
  const runners: Partial<Record<TribeId, AgentRunner>> = {};
  const forget: ForgetWorktree[] = [];
  const idle: Tribe[] = [];
  for (const tribe of kingdom.tribes.filter(({ enabled }) => enabled)) {
    const factory = ADAPTER_FACTORIES[tribe.adapter];
    if (factory === undefined) {
      idle.push(tribe);
      continue;
    }
    const hand = factory(tribe, kingdom, io);
    runners[tribe.id] = hand.runner;
    if (hand.forget !== undefined) forget.push(hand.forget);
  }
  return { runners, forget, idle };
}
