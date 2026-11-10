// What an adapter can do, declared per adapter and CLI version (implementation-plan §3.14, ADR 0021). The core
// never asks which CLI a tribe runs: it reads these flags, and tribeLimitsOf narrows a tribe that lacks one.
import type { TribeAuth } from '../schema/tribe.ts';

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
