// The run folder of one session, `<kingdom>/.runs/<quest>-<n>/` (implementation-plan §2.2, §3.6, §3.7): policy.json
// for the hook, settings.json and agents.json for the CLI, system.md for `--append-system-prompt-file`, and the
// prompt as it was sent, for the owner. Nothing here goes near `~/.claude` (CLAUDE.md).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { contextEnv, sessionRedactor, writePolicyFile } from '@elvaria/runner-core';
import type { RunContext, SpawnRequest } from '@elvaria/runner-core';

import { agentsOf, apprenticeModelsOf } from './agents.ts';
import { CLAUDE_PROTECTED_PATHS, settingsOf, settingsProblems } from './settings.ts';
import type { ApprenticeConfig } from './agents.ts';
import type { RunFiles } from './argv.ts';
import type { HookCommand } from './settings.ts';

export const SETTINGS_FILE = 'settings.json';
export const SYSTEM_FILE = 'system.md';
export const AGENTS_FILE = 'agents.json';
export const PROMPT_FILE = 'prompt.md';

/**
 * Env of every Claude session (cli-facts §1.6): two retries, so an exhausted account ends the session quickly and
 * the Steward pauses it, instead of ten; and one minute, not ten, of waiting for background work after the end.
 */
export const CLAUDE_ENV: Readonly<Record<string, string>> = {
  CLAUDE_CODE_MAX_RETRIES: '2',
  CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '60000',
};

/** Claude Code's own Bash timeouts: two minutes for a command, ten when the model asks for more. */
export const CLAUDE_BASH_DEFAULT_MS = 120_000;
export const CLAUDE_BASH_MAX_MS = 600_000;
const MS_PER_MINUTE = 60_000;

/**
 * Bash timeouts long enough for the territory's longest check, never shorter than the CLI's own (P1-48, P1-35 (j),
 * P1-37 (j)): a judge in a scratch plot runs the checks' commands itself, and dc1's e2e takes up to 30 minutes, which
 * Claude Code would cut at 2, or at 10 at most. The default too, so a judge that asks for no timeout is not cut.
 */
export function bashTimeoutEnv(
  territory: { readonly checks: readonly { readonly timeout_minutes: number }[] } | undefined,
): Record<string, string> {
  const longest = Math.max(0, ...(territory?.checks ?? []).map((check) => check.timeout_minutes));
  return {
    BASH_DEFAULT_TIMEOUT_MS: String(Math.max(CLAUDE_BASH_DEFAULT_MS, longest * MS_PER_MINUTE)),
    BASH_MAX_TIMEOUT_MS: String(Math.max(CLAUDE_BASH_MAX_MS, longest * MS_PER_MINUTE)),
  };
}

export interface RunSetup {
  readonly files: RunFiles;
  /**
   * `ELVARIA_*`, CLAUDE_ENV and the Bash timeouts: in settings.env and in the process env, so hooks get them either
   * way (§3.6).
   */
  readonly env: Readonly<Record<string, string>>;
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** Written once, before the CLI starts, and read by nothing else meanwhile: no atomic rename needed. */
const write = (file: string, text: string): Promise<void> => writeFile(file, text, 'utf8');

export async function writeRunFiles(
  req: SpawnRequest,
  ctx: RunContext,
  hookCommand: (policyFile: string) => HookCommand,
  apprentice: ApprenticeConfig,
): Promise<RunSetup> {
  const dir = req.run_dir;
  await mkdir(dir, { recursive: true });
  // The apprentice never runs on a model stronger than its master's (§3.12): the hook holds the list.
  const allowed = apprenticeModelsOf(req.character.model, apprentice.models);
  const extras = {
    ...(req.permissions.apprentice === null ? {} : { apprentice_models: allowed }),
    cli_protected_paths: CLAUDE_PROTECTED_PATHS,
  };
  const policyFile = await writePolicyFile(dir, ctx, req.permissions, extras);
  const env = { ...contextEnv(ctx), ...CLAUDE_ENV, ...bashTimeoutEnv(req.territory) };
  // Only an assignee writes a letter; a verifier reads it in its prompt and writes nothing (ADR 0008).
  const letter = req.role === 'assignee' ? req.handover : undefined;
  const settings = settingsOf(req.permissions, hookCommand(policyFile), env, letter);
  const problems = settingsProblems(settings);
  if (problems.length > 0) throw new Error(`generated settings are unsound: ${problems.join('; ')}`);
  const agents = agentsOf(req.permissions, apprentice, allowed);
  const files: RunFiles = {
    settings: path.join(dir, SETTINGS_FILE),
    system: path.join(dir, SYSTEM_FILE),
    ...(agents === undefined ? {} : { agents: path.join(dir, AGENTS_FILE) }),
  };
  await Promise.all([
    write(files.settings, json(settings)),
    write(files.system, req.prompt.system),
    // The owner's copy of what went on stdin, masked like every other file of the run (§3.9, ADR 0013).
    write(path.join(dir, PROMPT_FILE), sessionRedactor(req)(req.prompt.user)),
    ...(files.agents === undefined ? [] : [write(files.agents, json(agents))]),
  ]);
  return { files, env };
}
