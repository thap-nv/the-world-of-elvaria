// One tribe of kingdom.json: find its CLI, read the version, pin both into `tribes[].tool` (implementation-plan
// §3.14), and refuse Antigravity until the owner has acknowledged its terms (ADR 0018).
import { TribeSchema } from '@elvaria/domain';
import type { Tribe } from '@elvaria/domain';
import { toPortable } from '@elvaria/store';

import { launchOf } from '../process/launch.ts';
import { ADAPTER_FACTORIES } from '../run/crew.ts';
import { finding } from './finding.ts';
import { ADAPTER_PROGRAMS, locateTool } from './locate-tool.ts';
import { toolVersion } from './tool-version.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

export interface DoctorOptions {
  /** `--tool <tribe>=<path>`: where the owner says a tribe's CLI is. */
  readonly tools: ReadonlyMap<string, string>;
  /** `--pin`: accept a CLI whose version or path differs from the pinned one. */
  readonly pin: boolean;
  /** `--acknowledge-terms <tribe>`: the owner accepts the provider's terms for that tribe (ADR 0018). */
  readonly acknowledge: ReadonlySet<string>;
}

export interface TribeCheck {
  readonly findings: readonly Finding[];
  /** The tribe with its tool filled or re-pinned; undefined when kingdom.json keeps it as it is. */
  readonly updated?: Tribe;
}

type Tool = NonNullable<Tribe['tool']>;

/** Gemini CLI serves only paid API keys now (ADR 0018); every other adapter starts with the owner's login. */
const authOf = (adapter: string): Tool['auth'] => (adapter === 'gemini_cli' ? 'api_key' : 'login');

/** Where the CLI is and what version it says, or the finding that says why not. */
async function probe(tribe: Tribe, ctx: KingdomContext, options: DoctorOptions) {
  const { t } = ctx;
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

/** The tool to pin, or undefined when a pinned tool changed and the owner has not asked to re-pin. */
function nextTool(
  tribe: Tribe,
  found: { path: string; version: string; from: string },
  ctx: KingdomContext,
  options: DoctorOptions,
) {
  const pinned = tribe.tool;
  const changed = pinned !== undefined && (pinned.version !== found.version || pinned.path !== found.path);
  if (changed && !options.pin && found.from !== 'flag') return undefined;
  const acknowledged = options.acknowledge.has(tribe.id) ? { terms_acknowledged_at: ctx.now() } : {};
  return {
    ...pinned,
    path: found.path,
    version: found.version,
    auth: pinned?.auth ?? authOf(tribe.adapter),
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

/**
 * What the tribe's adapter checks once its CLI is pinned (P1-09): the login, how soon it ends, a built hook. A
 * login that does not work is an error; the rest are warnings. A tribe without an adapter package says nothing.
 */
async function adapterFindings(tribe: Tribe, ctx: KingdomContext): Promise<Finding[]> {
  const factory = ADAPTER_FACTORIES[tribe.adapter];
  if (factory === undefined) return [];
  const info = await factory(tribe, ctx.kingdom, ctx.io).runner.doctor();
  if (info.detail === undefined) return [];
  const text = ctx.t('cli.doctor.adapter_detail', { tribe: tribe.id, detail: info.detail });
  return [finding(info.auth_ok ? 'warn' : 'error', text)];
}

export async function checkTribe(
  tribe: Tribe,
  ctx: KingdomContext,
  options: DoctorOptions,
): Promise<TribeCheck> {
  const { t } = ctx;
  if (!tribe.enabled && !options.tools.has(tribe.id))
    return { findings: [finding('ok', t('cli.doctor.tribe_disabled', { tribe: tribe.id }))] };
  const found = await probe(tribe, ctx, options);
  if ('problem' in found) return { findings: [found.problem] };
  const tool = nextTool(tribe, found, ctx, options);
  if (tool === undefined) return { findings: [changedTool(tribe, found, ctx)] };
  const next = TribeSchema.safeParse({ ...tribe, tool });
  if (!next.success) {
    const details = next.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    return { findings: [finding('error', t('cli.doctor.tribe_invalid', { tribe: tribe.id }), details)] };
  }
  const findings = [
    finding('ok', t('cli.doctor.tool_found', { tribe: tribe.id, version: tool.version, path: tool.path })),
    ...(await adapterFindings(next.data, ctx)),
  ];
  if (tribe.adapter === 'antigravity' && next.data.tool?.terms_acknowledged_at === undefined)
    findings.push(
      finding('error', t('cli.doctor.terms_refused', { tribe: tribe.id }), [
        t('cli.doctor.terms_hint', { tribe: tribe.id }),
      ]),
    );
  const same = JSON.stringify(next.data) === JSON.stringify(tribe);
  return same ? { findings } : { findings, updated: next.data };
}
