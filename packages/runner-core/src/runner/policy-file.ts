// `<run_dir>/policy.json`, the file every CLI's hook gets as `--policy <file>` (implementation-plan §3.6 "(P1-08)",
// §3.9 "(P1-10)"): the territory laws the hook enforces, which no env variable can carry; the session context for a
// CLI that does not hand its env to hooks; the env names of the session's secrets, whose values the hook takes from
// its own env; and the tools of the class, for a CLI with no `--tools` (Antigravity). The hook reads it by hand
// (packages/hooks/src/policy.ts, `HookPolicy` v1), because it may not load zod; this is the writer of the same
// contract.
import path from 'node:path';

import { writeFileAtomic } from '@elvaria/store';

import type { ToolLaws, ToolPolicy } from '../policy/tool-policy.ts';
import type { RunContext } from './run-context.ts';

export const POLICY_FILE = 'policy.json';
/** `secrets` and `tools` are optional fields added by P1-10: a v1 reader without them still reads the rest. */
export const POLICY_VERSION = 1;

/** policy.json v1: `version`, the context (with `secrets`), `tools` and `laws`. Env `ELVARIA_*` wins in the hook. */
export interface PolicyFile extends RunContext {
  readonly version: typeof POLICY_VERSION;
  /** ToolPolicy.tools: the tools that exist for this session, in Claude Code names. */
  readonly tools: readonly string[];
  readonly laws: ToolLaws;
}

export const policyFileOf = (ctx: RunContext, policy: Pick<ToolPolicy, 'tools' | 'laws'>): PolicyFile => ({
  version: POLICY_VERSION,
  ...ctx,
  tools: [...policy.tools],
  laws: { forbidden_paths: policy.laws.forbidden_paths, forbidden_commands: policy.laws.forbidden_commands },
});

/** Writes the run's policy file and returns its native path, for `hookCommand(policyFile)`. */
export async function writePolicyFile(
  runDir: string,
  ctx: RunContext,
  policy: Pick<ToolPolicy, 'tools' | 'laws'>,
): Promise<string> {
  const file = path.join(runDir, POLICY_FILE);
  await writeFileAtomic(file, `${JSON.stringify(policyFileOf(ctx, policy), null, 2)}\n`);
  return file;
}
