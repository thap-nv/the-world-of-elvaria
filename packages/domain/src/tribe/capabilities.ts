// What an adapter can do, declared per adapter and CLI version (implementation-plan §3.14, ADR 0021). The core
// never asks which CLI a tribe runs: it reads these flags, and tribeLimitsOf narrows a tribe that lacks one.
import type { TribeAuth } from '../schema/tribe.ts';
import type { TribeId } from '../core/ids.ts';
import type { TribeModel, TribeModels } from './models.ts';

/**
 * headless and context_file are required (context falls back to the prompt); events, tool_gate, usage and
 * structured_output should be there; resume, compact and a bounded subagent are optional.
 */
export const ADAPTER_CAPABILITIES = [
  'headless',
  'context_file',
  'events',
  'tool_gate',
  'usage',
  'structured_output',
  'resume',
  'compact',
  'subagent',
] as const;

export type AdapterCapability = (typeof ADAPTER_CAPABILITIES)[number];

/** The yes-or-no capabilities, what tribeLimitsOf narrows a tribe by. */
export type AdapterFlags = Readonly<Record<AdapterCapability, boolean>>;

/** The operating systems a shell is declared for, as Node's `process.platform` names them (ADR 0015). */
export const SHELL_PLATFORMS = ['win32', 'darwin', 'linux'] as const;

export type ShellPlatform = (typeof SHELL_PLATFORMS)[number];

/** `AgentRunner.capabilities`: static per adapter and CLI version; `elvaria doctor` prints it. */
export type AdapterCapabilities = AdapterFlags & {
  /**
   * The sign-ins the adapter runs with, at least one (P1-19): `tribes[].tool.auth` must be one of them
   * (checkTribeAuth). Gemini CLI serves only a paid key (ADR 0018), so its adapter declares `['api_key']`.
   */
  readonly auth: readonly TribeAuth[];
  /**
   * The shell the session's command tool runs in, by operating system, as the prompt names it (P1-40): agy runs
   * PowerShell on Windows, where a character that writes bash fails. A system fact, not scripture. Declared only
   * where it was measured; an OS left out, or an adapter file older than the field, makes the prompt say nothing.
   */
  readonly shell?: Readonly<Partial<Record<ShellPlatform, string>>>;
  /**
   * Whether the CLI has tools of its own to search file names and contents in its headless mode (P1-53). false: a
   * class with Glob or Grep searches the files git tracks with the read-only `git grep` and `git ls-files` in its
   * command tool instead (runner-core's ToolPolicy `search_commands`); agy has no search tool under `-p`. Absent, as in
   * an adapter file older than the field: it has them.
   */
  readonly search?: boolean;
  /**
   * Whether the CLI has a tool of its own to read a file (PS-23). false (Codex): the prompt tells a class with a shell to
   * read, list and search with read-only commands of it, and one without a shell to read a tracked file through
   * `git grep`; the adapter must let such commands run. Absent, as in an adapter file older than the field: it has one.
   */
  readonly read?: boolean;
  /**
   * The models the CLI serves and the maker family of each (PS-23, tribe/models.ts): `character add` and `set_model`
   * take only these, the separation of duties reads each character's family from here (a model named without a family
   * never counts as another one), and a summoned character starts at its `starting_level`. Absent, as in an adapter
   * file older than the field: any slug, its family read from its first word (familyOf).
   */
  readonly models?: readonly TribeModel[];
};

const isShellPlatform = (platform: string): platform is ShellPlatform =>
  (SHELL_PLATFORMS as readonly string[]).includes(platform);

/** The shell a session of this adapter runs commands in on `platform`, or undefined when it declares none. */
export function shellOf(
  capabilities: Pick<AdapterCapabilities, 'shell'> | undefined,
  platform: string,
): string | undefined {
  if (!isShellPlatform(platform)) return undefined;
  const shell = capabilities?.shell?.[platform]?.trim();
  return shell === '' ? undefined : shell;
}

/** The declared models of each tribe whose runner names its own (`capabilities.models`), for planTick (PS-23). */
export function modelsOfTribes(
  capabilities: Readonly<Partial<Record<TribeId, Pick<AdapterCapabilities, 'models'>>>>,
): TribeModels {
  const models: Partial<Record<TribeId, readonly TribeModel[]>> = {};
  for (const [tribe, caps] of Object.entries(capabilities)) {
    // Object.entries widens the TribeId keys to string.
    if (caps?.models !== undefined) models[tribe as TribeId] = caps.models;
  }
  return models;
}
