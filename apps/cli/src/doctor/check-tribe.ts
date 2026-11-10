// One tribe of kingdom.json: find its CLI, read the version, pin both into `tribes[].tool` (implementation-plan
// §3.14), refuse Antigravity until the owner has acknowledged its terms (ADR 0018), and hold the pinned sign-in to
// the ones the adapter declares (`capabilities.auth`, checkTribeAuth; P1-19). An owner adapter file names its own
// CLI (./adapter-tool.ts).
import { TribeSchema, checkTribeAuth, defaultAuthOf } from '@elvaria/domain';
import type { AdapterCapabilities, Tribe } from '@elvaria/domain';
import type { AgentRunner } from '@elvaria/runner-core';
import { toPortable } from '@elvaria/store';

import { launchOf } from '../process/launch.ts';
import { handOf } from '../run/crew.ts';
import { isAdapterFile } from '../tribe/adapter-file.ts';
import { adapterFileTool } from './adapter-tool.ts';
import { shellFindings } from './check-shell.ts';
import { finding } from './finding.ts';
import { ADAPTER_PROGRAMS, locateTool } from './locate-tool.ts';
import { toolVersion } from './tool-version.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { ToolFound } from './adapter-tool.ts';
import type { Finding } from './finding.ts';

export interface DoctorOptions {
  /** `--tool <tribe>=<path>`: where the owner says a tribe's CLI is. */
  readonly tools: ReadonlyMap<string, string>;
  /** `--pin`: accept a CLI whose version or path differs from the pinned one. */
  readonly pin: boolean;
  /** `--acknowledge-terms <tribe>`: the owner accepts the provider's terms for that tribe (ADR 0018). */
  readonly acknowledge: ReadonlySet<string>;
  /** `--enable <tribe>`: turn a built-in tribe on once this run finds nothing wrong with it (P1-15, P1-34). */
  readonly enable: ReadonlySet<string>;
}

/** A disabled tribe doctor leaves alone: no `--tool` points at its CLI and no `--enable` turns it on. */
export const skipsTribe = (tribe: Tribe, options: DoctorOptions): boolean =>
  !tribe.enabled && !options.tools.has(tribe.id) && !options.enable.has(tribe.id);

export interface TribeCheck {
  readonly findings: readonly Finding[];
  /** The tribe with its tool filled or re-pinned; undefined when kingdom.json keeps it as it is. */
  readonly updated?: Tribe;
}

/** The capabilities of the tribe's runner; undefined for an adapter without one (gemini_cli, codex_cli today). */
async function capabilitiesOf(tribe: Tribe, ctx: KingdomContext): Promise<AdapterCapabilities | undefined> {
  const found = await handOf(tribe, { kingdom: ctx.kingdom, root: ctx.store.root }, ctx.io);
  return found.kind === 'ready' ? found.hand.runner.capabilities : undefined;
}

/** Where the CLI is and what version it says, or the finding that says why not. */
async function probe(tribe: Tribe, ctx: KingdomContext, options: DoctorOptions): Promise<ToolFound> {
  const { t } = ctx;
  if (isAdapterFile(tribe.adapter)) return adapterFileTool(tribe, ctx, options.tools.get(tribe.id));
  const program = ADAPTER_PROGRAMS[tribe.adapter];
  if (program === undefined)
    return {
      problem: finding('error', t('cli.doctor.unknown_adapter', { tribe: tribe.id, adapter: tribe.adapter })),
    };
  const located = await locateTool(tribe, program, options.tools.get(tribe.id), ctx.io);
  if (located.found === undefined) {
    const level = tribe.enabled ? 'error' : 'warn';
    const text = t(located.from === 'flag' ? 'cli.doctor.tool_path_bad' : 'cli.doctor.tool_missing', {
      tribe: tribe.id,
      program,
    });
    return { problem: finding(level, text, [t('cli.doctor.tool_hint', { tribe: tribe.id })]) };
  }
  const launch = await launchOf(located.found, ctx.io.nodePath);
  const version = launch === undefined ? undefined : await toolVersion(launch, ctx.io.env);
  if (version === undefined)
    return {
      problem: finding('error', t('cli.doctor.version_failed', { tribe: tribe.id, path: located.found })),
    };
  return { path: toPortable(located.found, ctx.io.platform), version, from: located.from };
}

/**
 * The tool to pin, or undefined when a pinned tool changed and the owner has not asked to re-pin. A first pin takes
 * the sign-in the adapter declares: the owner's login when it runs with one, Gemini CLI's paid key (ADR 0018).
 */
function nextTool(
  tribe: Tribe,
  found: { path: string; version: string; from: string },
  ctx: KingdomContext,
  options: DoctorOptions,
  capabilities: AdapterCapabilities | undefined,
) {
  const pinned = tribe.tool;
  const changed = pinned !== undefined && (pinned.version !== found.version || pinned.path !== found.path);
  if (changed && !options.pin && found.from !== 'flag') return undefined;
  const acknowledged = options.acknowledge.has(tribe.id) ? { terms_acknowledged_at: ctx.now() } : {};
  return {
    ...pinned,
    path: found.path,
    version: found.version,
    auth: pinned?.auth ?? defaultAuthOf(capabilities ?? { auth: [] }),
    ...acknowledged,
  };
}

/**
 * A pinned CLI that changed. locateTool tries the pinned file before PATH, so one found on PATH means the pinned
 * file is gone (a VS Code extension update moves Claude Code's folder): the tribe cannot run until re-pinned,
 * which is an error. A file updated in place (agy) still runs, so a new version there is a warning.
 */
function changedTool(
  tribe: Tribe,
  found: { path: string; version: string; from: string },
  ctx: KingdomContext,
) {
  const params = {
    tribe: tribe.id,
    pinned: tribe.tool?.version ?? '',
    pinned_path: tribe.tool?.path ?? '',
    version: found.version,
    path: found.path,
  };
  const hint = [ctx.t('cli.doctor.pin_hint')];
  return found.from === 'path'
    ? finding('error', ctx.t('cli.doctor.tool_moved', params), hint)
    : finding('warn', ctx.t('cli.doctor.tool_changed', params), hint);
}

/** A pinned sign-in the adapter does not run with (P1-19): the tribe cannot run until kingdom.json names another. */
export function authFindings(
  tribe: Tribe,
  capabilities: AdapterCapabilities,
  ctx: KingdomContext,
): Finding[] {
  const checked = checkTribeAuth(capabilities, tribe);
  if (checked.ok) return [];
  const { auth, declared } = checked.error;
  const params = { tribe: tribe.id, adapter: tribe.adapter, auth, declared: declared.join(', ') };
  return [finding('error', ctx.t('cli.doctor.auth_not_declared', params))];
}

/**
 * What the tribe's adapter checks once its CLI is pinned (P1-09): the sign-in it runs with (P1-19), the login, how
 * soon it ends, a built hook. A sign-in it does not declare or a login that does not work is an error; the rest are
 * warnings. A tribe without an adapter package says nothing.
 */
async function adapterFindings(tribe: Tribe, ctx: KingdomContext): Promise<Finding[]> {
  const found = await handOf(tribe, { kingdom: ctx.kingdom, root: ctx.store.root }, ctx.io);
  if (found.kind !== 'ready') return [];
  const { runner } = found.hand;
  return [...authFindings(tribe, runner.capabilities, ctx), ...(await loginFindings(tribe, runner, ctx))];
}

/**
 * What the adapter says of its CLI's login (`runner.doctor()`, P1-09): an error when the CLI cannot sign in, even
 * without a reason given, a warning for anything else it notes. doctor and `tribe check` hold a tribe to it alike
 * (P1-34): the conformance suite asks only that `auth_ok` is a boolean.
 */
export async function loginFindings(
  tribe: Tribe,
  runner: AgentRunner,
  ctx: KingdomContext,
): Promise<Finding[]> {
  const info = await runner.doctor();
  if (info.auth_ok && info.detail === undefined) return [];
  const detail = info.detail ?? ctx.t('cli.doctor.login_failed');
  const text = ctx.t('cli.doctor.adapter_detail', { tribe: tribe.id, detail });
  return [finding(info.auth_ok ? 'warn' : 'error', text)];
}

/**
 * One tribe as kingdom.json should hold it after this run. `--enable` checks a disabled tribe as an enabled one and
 * writes `enabled: true` only when this run has no error for it (§3.14 "không qua thì không bật được", P1-34): before
 * P1-34 a tribe whose login failed was enabled, and the Steward handed it quests whose every session broke. Its CLI
 * is still pinned when that is all that changed.
 */
export async function checkTribe(
  tribe: Tribe,
  ctx: KingdomContext,
  options: DoctorOptions,
): Promise<TribeCheck> {
  const { t } = ctx;
  if (skipsTribe(tribe, options))
    return { findings: [finding('ok', t('cli.doctor.tribe_disabled', { tribe: tribe.id }))] };
  const enabling = !tribe.enabled && options.enable.has(tribe.id);
  const check = await checkFound(enabling ? { ...tribe, enabled: true } : tribe, tribe, ctx, options);
  if (!enabling) return check;
  const failed = check.updated === undefined || check.findings.some(({ level }) => level === 'error');
  if (!failed) {
    const enabled = finding('ok', t('cli.doctor.tribe_enabled', { tribe: tribe.id }));
    return { ...check, findings: [...check.findings, enabled] };
  }
  const findings = [
    ...check.findings,
    finding('error', t('cli.doctor.tribe_still_disabled', { tribe: tribe.id })),
  ];
  const kept = check.updated === undefined ? undefined : { ...check.updated, enabled: false };
  return kept === undefined || JSON.stringify(kept) === JSON.stringify(tribe)
    ? { findings }
    : { findings, updated: kept };
}

/**
 * The tribe's CLI found, its version pinned, its adapter asked, its terms checked (ADR 0018); `updated` when the
 * result differs from `stored`, the tribe as kingdom.json holds it.
 */
async function checkFound(
  tribe: Tribe,
  stored: Tribe,
  ctx: KingdomContext,
  options: DoctorOptions,
): Promise<TribeCheck> {
  const { t } = ctx;
  const found = await probe(tribe, ctx, options);
  if ('problem' in found) return { findings: [found.problem] };
  const capabilities = await capabilitiesOf(tribe, ctx);
  const tool = nextTool(tribe, found, ctx, options, capabilities);
  if (tool === undefined) return { findings: [changedTool(tribe, found, ctx)] };
  const next = TribeSchema.safeParse({ ...tribe, tool });
  if (!next.success) {
    const details = next.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    return { findings: [finding('error', t('cli.doctor.tribe_invalid', { tribe: tribe.id }), details)] };
  }
  // Without the terms the adapter would only say the same in English; its login check comes once they are recorded.
  const refused = tribe.adapter === 'antigravity' && next.data.tool?.terms_acknowledged_at === undefined;
  const findings = [
    finding('ok', t('cli.doctor.tool_found', { tribe: tribe.id, version: tool.version, path: tool.path })),
    ...(refused
      ? [
          finding('error', t('cli.doctor.terms_refused', { tribe: tribe.id }), [
            t('cli.doctor.terms_hint', { tribe: tribe.id }),
          ]),
        ]
      : await adapterFindings(next.data, ctx)),
    // An error here is the tribe's own (P1-41): `--enable` keeps it off, its sessions could not run pnpm.
    ...(await shellFindings(tribe, capabilities, ctx)),
  ];
  const same = JSON.stringify(next.data) === JSON.stringify(stored);
  return same ? { findings } : { findings, updated: next.data };
}
