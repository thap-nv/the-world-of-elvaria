// The runners the Steward is given (implementation-plan §3.7, §3.14, ADR 0021): one per enabled tribe, built from
// `kingdom.tribes[].adapter`. Only this composition root names a CLI; a tribe whose adapter has no runner yet
// takes no quest. Claude Code (`claude_code`), since P1-15 Antigravity (`antigravity`, ./antigravity.ts), and
// since P1-19 an owner adapter file `adapters/<name>.mjs` (../tribe/adapter-file.ts).
// The hook's command comes from @elvaria/hooks, which the adapters may not import (§1.3).
import { HOOK_SCRIPT, hookCommand } from '@elvaria/hooks';
import { createClaudeForget, createClaudeRunner } from '@elvaria/runner-claude';
import type { Kingdom, Tribe, TribeId } from '@elvaria/domain';
import type { ClaudeToolOptions } from '@elvaria/runner-claude';
import type { AgentRunner, ForgetWorktree } from '@elvaria/runner-core';
import { fromPortable } from '@elvaria/store';

import { minimalEnv } from '../process/minimal-env.ts';
import { isAdapterFile, loadAdapterFile } from '../tribe/adapter-file.ts';
import { antigravityRunner } from './antigravity.ts';
import type { CliIo } from '../io.ts';

/** One tribe's runner and what its CLI must forget when a worktree is released (§3.3). */
export interface Hand {
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

/** The Gemini tribe on Antigravity CLI (P1-12b, wired in P1-15); agy keeps nothing per worktree to forget. */
const antigravity: AdapterFactory = (tribe, _kingdom, io) => ({ runner: antigravityRunner(tribe, io) });

/** Built-in adapters with a runner today; gemini_cli and codex_cli come later. */
export const ADAPTER_FACTORIES: Readonly<Record<string, AdapterFactory>> = {
  claude_code: claudeCode,
  antigravity,
};

/** Where a tribe's runner comes from, and whether there is one. */
export type HandOf =
  | { readonly kind: 'ready'; readonly hand: Hand }
  /** A built-in adapter without a package yet (gemini_cli, codex_cli): the tribe waits. */
  | { readonly kind: 'none' }
  /** An adapter file that does not load or does not keep the contract: why, one line each. */
  | { readonly kind: 'broken'; readonly problems: readonly string[] };

/** The kingdom a tribe belongs to: its file and its folder (where adapter files live). */
export interface KingdomPlace {
  readonly kingdom: Kingdom;
  readonly root: string;
}

/** The tribe's runner, whatever its adapter; `toolPath` is a CLI the owner just named (`doctor --tool`). */
export async function handOf(
  tribe: Tribe,
  place: KingdomPlace,
  io: CliIo,
  toolPath?: string,
): Promise<HandOf> {
  if (isAdapterFile(tribe.adapter)) {
    const loaded = await loadAdapterFile(place.root, tribe, io, toolPath);
    return loaded.ok
      ? { kind: 'ready', hand: { runner: loaded.value } }
      : { kind: 'broken', problems: loaded.error };
  }
  const factory = ADAPTER_FACTORIES[tribe.adapter];
  return factory === undefined
    ? { kind: 'none' }
    : { kind: 'ready', hand: factory(tribe, place.kingdom, io) };
}

export interface Crew {
  readonly runners: Partial<Record<TribeId, AgentRunner>>;
  readonly forget: readonly ForgetWorktree[];
  /** Enabled tribes whose adapter has no runner yet: they take no work. */
  readonly idle: readonly Tribe[];
  /** Enabled tribes whose adapter file is broken: they take no work until it is fixed. */
  readonly broken: readonly { readonly tribe: Tribe; readonly problems: readonly string[] }[];
}

export async function crewOf(place: KingdomPlace, io: CliIo): Promise<Crew> {
  const runners: Partial<Record<TribeId, AgentRunner>> = {};
  const forget: ForgetWorktree[] = [];
  const idle: Tribe[] = [];
  const broken: { tribe: Tribe; problems: readonly string[] }[] = [];
  for (const tribe of place.kingdom.tribes.filter(({ enabled }) => enabled)) {
    const found = await handOf(tribe, place, io);
    if (found.kind === 'none') idle.push(tribe);
    else if (found.kind === 'broken') broken.push({ tribe, problems: found.problems });
    else {
      runners[tribe.id] = found.hand.runner;
      if (found.hand.forget !== undefined) forget.push(found.hand.forget);
    }
  }
  return { runners, forget, idle, broken };
}
