// Whether the shell a tribe's sessions run commands in can start npm's shims (P1-41, the P1-35 proposal (a)). On
// Windows agy runs every command in powershell.exe (docs/spikes/antigravity-2026-11.md #16), where `pnpm` resolves to
// pnpm.ps1, and Windows' default Execution Policy (Restricted) refuses every script: each agy session of the P1-21
// and P1-35 runs failed every pnpm command, and a judge passed work it never ran (docs/guides/first-quest.md §10).
import type { Tribe } from '@elvaria/domain';

import { findExecutable } from '../process/find-executable.ts';
import { launchOf } from '../process/launch.ts';
import { minimalEnv } from '../process/minimal-env.ts';
import { runProcess } from '../process/run-process.ts';
import { finding } from './finding.ts';
import type { Translate } from '@elvaria/i18n';
import type { CliIo } from '../io.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

/** Adapters whose sessions run commands through powershell.exe on Windows: data, not a switch on the tribe (ADR 0021). */
export const POWERSHELL_ADAPTERS: ReadonlySet<string> = new Set(['antigravity']);

/** Policies that let a local unsigned script run; AllSigned refuses npm's unsigned shims, Restricted every script. */
const RUNS_LOCAL_SCRIPTS = new Set(['remotesigned', 'unrestricted', 'bypass']);
const POLICIES = new Set([...RUNS_LOCAL_SCRIPTS, 'restricted', 'allsigned', 'undefined', 'default']);

const POLICY_TIMEOUT_MS = 20_000;

/** What `Get-ExecutionPolicy` said: the effective policy, or why there is none. */
export type PolicyRead =
  | { readonly kind: 'read'; readonly policy: string }
  | { readonly kind: 'no_powershell' }
  | { readonly kind: 'unread' };

/** The effective policy, asked of the powershell.exe a session would find: PATH, in the sessions' minimal env. */
export async function readExecutionPolicy(io: CliIo): Promise<PolicyRead> {
  const file = await findExecutable('powershell', io.env, io.platform);
  const launch = file === undefined ? undefined : await launchOf(file, io.nodePath);
  if (launch === undefined) return { kind: 'no_powershell' };
  // PowerShell reads parameter and cmdlet names in any case; lower case keeps them out of the prose lint (ADR 0014).
  const outcome = await runProcess(
    launch.file,
    [...launch.args, '-noprofile', '-noninteractive', '-command', 'get-executionpolicy'],
    { env: minimalEnv(io.env), timeoutMs: POLICY_TIMEOUT_MS },
  );
  const policy = outcome.stdout.trim();
  return outcome.code === 0 && POLICIES.has(policy.toLowerCase())
    ? { kind: 'read', policy }
    : { kind: 'unread' };
}

/** ✓ when local scripts run, ✗ with the command that lets them, ! when PowerShell could not be asked. */
export function policyFinding(tribe: string, read: PolicyRead, t: Translate): Finding {
  if (read.kind === 'no_powershell') return finding('warn', t('cli.doctor.powershell_missing', { tribe }));
  if (read.kind === 'unread') return finding('warn', t('cli.doctor.powershell_unread', { tribe }));
  const { policy } = read;
  if (RUNS_LOCAL_SCRIPTS.has(policy.toLowerCase()))
    return finding('ok', t('cli.doctor.powershell', { tribe, policy }));
  return finding('error', t('cli.doctor.powershell_refuses', { tribe, policy }), [
    t('cli.doctor.powershell_hint'),
  ]);
}

/** Nothing outside Windows, or for a tribe whose sessions do not run commands through PowerShell. */
export async function shellFindings(tribe: Tribe, ctx: KingdomContext): Promise<Finding[]> {
  if (ctx.io.platform !== 'win32' || !POWERSHELL_ADAPTERS.has(tribe.adapter)) return [];
  return [policyFinding(tribe.id, await readExecutionPolicy(ctx.io), ctx.t)];
}
