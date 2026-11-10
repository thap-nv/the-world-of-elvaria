// `<run_dir>/policy.json`, the file every CLI's hook gets as `--policy <file>` (implementation-plan §3.6 "(P1-08)",
// §3.9 "(P1-10)"): the territory laws the hook enforces, which no env variable can carry; the session context for a
// CLI that does not hand its env to hooks; the env names of the session's secrets, whose values the hook takes from
// its own env; and the tools of the class, for a CLI with no `--tools` (Antigravity). The hook reads it by hand
// (packages/hooks/src/policy.ts, `HookPolicy` v1), because it may not load zod; this is the writer of the same
// contract.
import path from 'node:path';

import { writeFileAtomic } from '@elvaria/store';

import { PATCH_FILE } from '../plot/patch.ts';
import { GIT_PATHS } from '../policy/constants.ts';
import type { ToolLaws, ToolPolicy } from '../policy/tool-policy.ts';
import type { RunContext } from './run-context.ts';

export const POLICY_FILE = 'policy.json';
/**
 * `secrets` and `tools` (P1-10), `apprentice_models` (P1-17), `laws.read_only_paths` and `cli_protected_paths`
 * (P1-24), `laws.patch_paths` and `patch_file` (P1-28) are optional fields added later: a v1 reader without them
 * still reads the rest. Since P1-49 every file has `cli_protected_paths`, with git's own folder in it.
 */
export const POLICY_VERSION = 1;

/** policy.json v1: `version`, the context (with `secrets`), `tools` and `laws`. Env `ELVARIA_*` wins in the hook. */
export interface PolicyFile extends RunContext {
  readonly version: typeof POLICY_VERSION;
  /** ToolPolicy.tools: the tools that exist for this session, in Claude Code names. */
  readonly tools: readonly string[];
  readonly laws: ToolLaws;
  /**
   * The models the character's apprentice may run on (§3.12, decided after P1-09): the hook refuses an Agent call
   * naming another `model`. The adapter knows its models and their order; absent: no such check.
   */
  readonly apprentice_models?: readonly string[];
  /**
   * Globs no write tool changes whatever the permission rules say: those the CLI itself refuses (P1-24: Claude Code
   * guards `.husky/`, `.git/`, `.claude/`…), and git's own folder for every tribe (GIT_PATHS, P1-49: agy wrote
   * `.git/`). The hook refuses a write tool there first, with a reason the model can act on (ask the owner) instead
   * of the CLI's bare "denied"; absent (a file written before P1-49): no such check.
   */
  readonly cli_protected_paths?: readonly string[];
  /**
   * PATCH_FILE when `laws.patch_paths` is not empty (P1-28): the hook names it when it refuses a write the CLI would
   * refuse to a path of patch_paths, so the change goes into a patch the Steward applies instead of a question.
   */
  readonly patch_file?: string;
}

/** What only the adapter knows, for the policy file. */
export interface PolicyExtras {
  readonly apprentice_models?: readonly string[];
  readonly cli_protected_paths?: readonly string[];
}

const listOf = (key: keyof PolicyExtras, extras: PolicyExtras) => {
  const list = extras[key];
  return list === undefined ? {} : { [key]: [...list] };
};

/** The adapter's own list first (Claude's already has `.git/**`), then git's folder for a tribe whose CLI lacks it. */
const protectedOf = (extras: PolicyExtras): string[] => [
  ...new Set([...(extras.cli_protected_paths ?? []), ...GIT_PATHS]),
];

export const policyFileOf = (
  ctx: RunContext,
  policy: Pick<ToolPolicy, 'tools' | 'laws'>,
  extras: PolicyExtras = {},
): PolicyFile => ({
  version: POLICY_VERSION,
  ...ctx,
  tools: [...policy.tools],
  laws: {
    forbidden_paths: policy.laws.forbidden_paths,
    read_only_paths: policy.laws.read_only_paths,
    patch_paths: policy.laws.patch_paths,
    forbidden_commands: policy.laws.forbidden_commands,
  },
  ...listOf('apprentice_models', extras),
  cli_protected_paths: protectedOf(extras),
  ...(policy.laws.patch_paths.length === 0 ? {} : { patch_file: PATCH_FILE }),
});

/** Writes the run's policy file and returns its native path, for `hookCommand(policyFile)`. */
export async function writePolicyFile(
  runDir: string,
  ctx: RunContext,
  policy: Pick<ToolPolicy, 'tools' | 'laws'>,
  extras: PolicyExtras = {},
): Promise<string> {
  const file = path.join(runDir, POLICY_FILE);
  await writeFileAtomic(file, `${JSON.stringify(policyFileOf(ctx, policy, extras), null, 2)}\n`);
  return file;
}
