// `<run_dir>/policy.json`, the file every CLI's hook gets as `--policy <file>` (implementation-plan §3.6 "(P1-08)"):
// the territory laws the hook enforces, which no env variable can carry, and the session context for a CLI that
// does not hand its env to hooks. The hook reads it by hand (packages/hooks/src/policy.ts, `HookPolicy` v1),
// because it may not load zod; this is the writer of the same contract.
import path from 'node:path';

import { writeFileAtomic } from '@elvaria/store';

import type { ToolLaws } from '../policy/tool-policy.ts';
import type { RunContext } from './run-context.ts';

export const POLICY_FILE = 'policy.json';
export const POLICY_VERSION = 1;

/** policy.json v1: `version`, the context, and `laws`. Env `ELVARIA_*` wins over it in the hook. */
export interface PolicyFile extends RunContext {
  readonly version: typeof POLICY_VERSION;
  readonly laws: ToolLaws;
}

export const policyFileOf = (ctx: RunContext, laws: ToolLaws): PolicyFile => ({
  version: POLICY_VERSION,
  ...ctx,
  laws: { forbidden_paths: laws.forbidden_paths, forbidden_commands: laws.forbidden_commands },
});

/** Writes the run's policy file and returns its native path, for `hookCommand(policyFile)`. */
export async function writePolicyFile(runDir: string, ctx: RunContext, laws: ToolLaws): Promise<string> {
  const file = path.join(runDir, POLICY_FILE);
  await writeFileAtomic(file, `${JSON.stringify(policyFileOf(ctx, laws), null, 2)}\n`);
  return file;
}
