// What the composition root needs to declare the hook in a CLI's settings (implementation-plan §3.6, §3.7): the
// runner adapters cannot import this package (§1.3), so apps/cli hands them the command.
import path from 'node:path';
import process from 'node:process';

/**
 * The export condition under which @elvaria/eventlog resolves to its build (`dist/`) instead of its `.ts`
 * source: type stripping costs ~40 ms per start, out of a 100 ms budget (§3.6 "Hook trên eventlog").
 */
export const DIST_CONDITION = 'elvaria-dist';

/** The built hook; `pnpm --filter @elvaria/hooks build` writes it, and the event log's build with it. */
export const HOOK_SCRIPT = path.join(import.meta.dirname, '..', 'dist', 'elvaria-hook.js');

export interface HookCommand {
  /** Absolute path of the Node running Elvaria: hooks of the exec form do not search PATH for `.cmd` shims. */
  readonly command: string;
  readonly args: readonly string[];
}

/** `command` + `args` of the hook, for the exec form of a CLI's hook settings (cli-facts §1.5). */
export function hookCommand(policyFile?: string): HookCommand {
  const policy = policyFile === undefined ? [] : ['--policy', policyFile];
  return { command: process.execPath, args: [`--conditions=${DIST_CONDITION}`, HOOK_SCRIPT, ...policy] };
}

export { ANTIGRAVITY_HOOK_EVENTS } from './antigravity/translate.ts';
export { CLAUDE_HOOK_EVENTS } from './claude/translate.ts';
export { STOP_BLOCK_LIMIT } from './handover.ts';
export { POLICY_VERSION, parsePolicy } from './policy.ts';
export type { HookPolicy, PolicyResult } from './policy.ts';
export { runHook } from './run-hook.ts';
export type { HookIo, HookOutcome } from './run-hook.ts';
