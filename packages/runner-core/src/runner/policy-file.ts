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
import type { HookDialect } from './hook-dialect.ts';
import type { RunContext } from './run-context.ts';

export const POLICY_FILE = 'policy.json';
/**
 * `secrets` and `tools` (P1-10), `apprentice_models` (P1-17), `laws.read_only_paths` and `cli_protected_paths`
 * (P1-24), `laws.patch_paths` and `patch_file` (P1-28), `search_commands` (P1-53), `graph_commands` (PS-21), `dialect` (PS-23) are
 * optional fields added later: a
 * v1 reader without them still reads the rest. Since P1-49 every file has `cli_protected_paths`, with git's own folder.
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
   * Of `cli_protected_paths`, the globs only Elvaria keeps (P1-56): git's folder for a tribe whose CLI does not lock
   * it, which the adapter did not list (agy). The hook's refusal calls them Elvaria's rule and not the CLI's. Absent
   * when the CLI locks every one of them (Claude Code) and in a file written before P1-56.
   */
  readonly elvaria_protected_paths?: readonly string[];
  /**
   * PATCH_FILE when `laws.patch_paths` is not empty (P1-28): the hook names it when it refuses a write the CLI would
   * refuse to a path of patch_paths, so the change goes into a patch the Steward applies instead of a question.
   */
  readonly patch_file?: string;
  /**
   * ToolPolicy.search_commands (P1-53): the hook lets a class without a shell run them, one plain call per line, and
   * refuses `git grep` options that run a program or reach past the tracked files. Absent: none were granted.
   */
  readonly search_commands?: readonly string[];
  /**
   * ToolPolicy.graph_commands (PS-21): the hook lets a class without a shell run them, one plain call per line, and
   * refuses every other graphify line, and options of these that name another graph, for every class. Absent: the
   * quest has no graph, and no graphify line runs.
   */
  readonly graph_commands?: readonly string[];
  /**
   * How the hook reads the payload of a CLI it does not know by name, and writes its answers (PS-23): the adapter's
   * own. Absent: Claude Code, agy or Codex, which the hook knows.
   */
  readonly dialect?: HookDialect;
}

/** What only the adapter knows, for the policy file. */
export interface PolicyExtras {
  readonly apprentice_models?: readonly string[];
  readonly cli_protected_paths?: readonly string[];
  /** The neutral hook dialect of the adapter's CLI (PS-23). */
  readonly dialect?: HookDialect;
}

const listOf = (key: 'apprentice_models' | 'cli_protected_paths', extras: PolicyExtras) => {
  const list = extras[key];
  return list === undefined ? {} : { [key]: [...list] };
};

/** The adapter's own list first (Claude's already has `.git/**`), then git's folder for a tribe whose CLI lacks it. */
const protectedOf = (extras: PolicyExtras): string[] => [
  ...new Set([...(extras.cli_protected_paths ?? []), ...GIT_PATHS]),
];

/** What of git's folder the adapter did not list: Elvaria's own rule (P1-56). */
const ownProtectedOf = (extras: PolicyExtras): string[] =>
  GIT_PATHS.filter((glob) => !(extras.cli_protected_paths ?? []).includes(glob));

type PolicyPart = Pick<ToolPolicy, 'tools' | 'laws' | 'search_commands' | 'graph_commands'>;

export const policyFileOf = (ctx: RunContext, policy: PolicyPart, extras: PolicyExtras = {}): PolicyFile => ({
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
  ...(ownProtectedOf(extras).length === 0 ? {} : { elvaria_protected_paths: ownProtectedOf(extras) }),
  ...(policy.laws.patch_paths.length === 0 ? {} : { patch_file: PATCH_FILE }),
  ...(policy.search_commands === undefined ? {} : { search_commands: [...policy.search_commands] }),
  ...(policy.graph_commands === undefined ? {} : { graph_commands: [...policy.graph_commands] }),
  ...(extras.dialect === undefined ? {} : { dialect: extras.dialect }),
});

/** Writes the run's policy file and returns its native path, for `hookCommand(policyFile)`. */
export async function writePolicyFile(
  runDir: string,
  ctx: RunContext,
  policy: PolicyPart,
  extras: PolicyExtras = {},
): Promise<string> {
  const file = path.join(runDir, POLICY_FILE);
  await writeFileAtomic(file, `${JSON.stringify(policyFileOf(ctx, policy, extras), null, 2)}\n`);
  return file;
}
