// One tribe of kingdom.json: find its CLI, read the version, pin both into `tribes[].tool` (implementation-plan
// §3.14, ./pin-tool.ts), refuse Antigravity until the owner has acknowledged its terms (ADR 0018), hold the pinned
// sign-in to the ones the adapter declares (`capabilities.auth`, checkTribeAuth; P1-19) and its config folder to the
// adapter's declaration and outside the characters' reach (./config-dir.ts, PS-27). An owner adapter file names its
// own CLI (./adapter-tool.ts). What its adapter says of the account goes on to the check across tribes
// (./check-accounts.ts), and `--enable` is settled after it.
import { TribeSchema, checkTribeAuth } from '@elvaria/domain';
import type { AdapterCapabilities, Tribe } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';
import type { ToolInfo } from '@elvaria/runner-core';
import { toPortable } from '@elvaria/store';

import { launchOf } from '../process/launch.ts';
import { BUILT_IN_ADAPTERS, handOf } from '../run/crew.ts';
import { isAdapterFile } from '../tribe/adapter-file.ts';
import { adapterFileTool } from './adapter-tool.ts';
import { promptMaxFindings, visionFindings } from './check-prompt.ts';
import { shellFindings } from './check-shell.ts';
import { configDirFindings } from './config-dir.ts';
import { finding } from './finding.ts';
import { locateTool } from './locate-tool.ts';
import { infoText } from './note-text.ts';
import { changedTool, nextTool, uncheckedFindings } from './pin-tool.ts';
import { toolVersion } from './tool-version.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { ToolFound } from './adapter-tool.ts';
import type { AccountSubject } from './check-accounts.ts';
import type { Finding } from './finding.ts';
import type { PinOptions } from './pin-tool.ts';

export interface DoctorOptions extends PinOptions {
  /** `--tool <tribe>=<path>`: where the owner says a tribe's CLI is. */
  readonly tools: ReadonlyMap<string, string>;
  /** `--enable <tribe>`: turn a built-in tribe on once this run finds nothing wrong with it (P1-15, P1-34). */
  readonly enable: ReadonlySet<string>;
}

/** A disabled tribe doctor leaves alone: no `--tool`, `--config-dir` or `--enable` names it. */
export const skipsTribe = (tribe: Tribe, options: DoctorOptions): boolean =>
  !tribe.enabled &&
  !options.tools.has(tribe.id) &&
  !options.configDirs.has(tribe.id) &&
  !options.enable.has(tribe.id);

export interface TribeCheck {
  readonly findings: readonly Finding[];
  /** The tribe with its tool filled or re-pinned; undefined when kingdom.json keeps it as it is. */
  readonly updated?: Tribe;
  /** `--enable` asked to turn the tribe on; settleEnabling decides once the check across tribes is in. */
  readonly enabling?: true;
  /** The tribe as checked and what its adapter's doctor() said, for the check across tribes (PS-27). */
  readonly account?: AccountSubject;
}

/** The capabilities of the tribe's runner; undefined for an adapter without one (gemini_cli today). */
async function capabilitiesOf(tribe: Tribe, ctx: KingdomContext): Promise<AdapterCapabilities | undefined> {
  const found = await handOf(tribe, { kingdom: ctx.kingdom, root: ctx.store.root }, ctx.io);
  return found.kind === 'ready' ? found.hand.runner.capabilities : undefined;
}

/** Where the CLI is and what version it says, or the finding that says why not. */
async function probe(tribe: Tribe, ctx: KingdomContext, options: DoctorOptions): Promise<ToolFound> {
  const { t } = ctx;
  if (isAdapterFile(tribe.adapter)) return adapterFileTool(tribe, ctx, options.tools.get(tribe.id));
  const tool = BUILT_IN_ADAPTERS[tribe.adapter]?.tool;
  if (tool === undefined)
    return {
      problem: finding('error', t('cli.doctor.unknown_adapter', { tribe: tribe.id, adapter: tribe.adapter })),
    };
  const { program } = tool;
  const located = await locateTool(tribe, tool, options.tools.get(tribe.id), ctx.io);
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

const NO_OPTIONS: DoctorOptions = {
  tools: new Map(),
  pin: false,
  acknowledge: new Set(),
  configDirs: new Map(),
  enable: new Set(),
};

/**
 * Where the tribe's CLI is and what version it says, as doctor finds it: `given` (a path the owner names), else the
 * pinned file, else PATH or the adapter's own search; or the finding that says why there is none. `tribe check`
 * runs the real CLI found so (B1 of the lessons of 2026-11-13).
 */
export const locateTribeTool = (tribe: Tribe, ctx: KingdomContext, given?: string): Promise<ToolFound> =>
  probe(
    tribe,
    ctx,
    given === undefined ? NO_OPTIONS : { ...NO_OPTIONS, tools: new Map([[tribe.id, given]]) },
  );

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

/** What the tribe's adapter checked, and what its CLI said (`runner.doctor()`), for the check across tribes. */
interface AdapterCheck {
  readonly findings: readonly Finding[];
  readonly info?: ToolInfo;
}

/**
 * What the tribe's adapter checks once its CLI is pinned (P1-09): the sign-in it runs with (P1-19), the login, how
 * soon it ends, a built hook, the config folder its CLI runs in (PS-27). A sign-in it does not declare or a login that
 * does not work is an error; the rest are warnings. A tribe without an adapter package says nothing.
 */
async function adapterFindings(tribe: Tribe, ctx: KingdomContext): Promise<AdapterCheck> {
  const found = await handOf(tribe, { kingdom: ctx.kingdom, root: ctx.store.root }, ctx.io);
  if (found.kind !== 'ready') return { findings: [] };
  const { runner } = found.hand;
  const info = await runner.doctor();
  const findings = [...authFindings(tribe, runner.capabilities, ctx), ...loginFindingsOf(tribe, info, ctx)];
  return { findings, info };
}

/**
 * What the adapter says of its CLI's login (`runner.doctor()`, P1-09): an error when the CLI cannot sign in, even
 * without a reason given, a warning for anything else it notes. doctor and `tribe check` hold a tribe to it alike
 * (P1-34): the conformance suite asks only that `auth_ok` is a boolean.
 */
export function loginFindingsOf(tribe: Tribe, info: ToolInfo, ctx: Pick<KingdomContext, 't'>): Finding[] {
  const said = infoText(ctx.t, info);
  if (info.auth_ok && said === undefined) return [];
  const detail = said ?? ctx.t('cli.doctor.login_failed');
  const text = ctx.t('cli.doctor.adapter_detail', { tribe: tribe.id, detail });
  return [finding(info.auth_ok ? 'warn' : 'error', text)];
}

/**
 * One tribe checked by this run. `--enable` is asked of it but not decided yet: the check across tribes
 * (./check-accounts.ts) may still add an error, and settleEnabling decides once it has.
 */
export async function checkTribe(
  tribe: Tribe,
  ctx: KingdomContext,
  options: DoctorOptions,
): Promise<TribeCheck> {
  if (skipsTribe(tribe, options))
    return { findings: [finding('ok', ctx.t('cli.doctor.tribe_disabled', { tribe: tribe.id }))] };
  const enabling = !tribe.enabled && options.enable.has(tribe.id);
  const check = await checkFound(enabling ? { ...tribe, enabled: true } : tribe, tribe, ctx, options);
  return enabling ? { ...check, enabling: true } : check;
}

/**
 * One tribe as kingdom.json should hold it after this run. `--enable` checks a disabled tribe as an enabled one and
 * writes `enabled: true` only when this run has no error for it (§3.14 "không qua thì không bật được", P1-34): before
 * P1-34 a tribe whose login failed was enabled, and the Steward handed it quests whose every session broke. Its CLI
 * is still pinned when that is all that changed. `check` holds the errors across tribes too (PS-27).
 */
export function settleEnabling(tribe: Tribe, check: TribeCheck, t: Translate): TribeCheck {
  if (check.enabling !== true) return check;
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

/** Without the terms its CLI wants, the adapter would only say the same in English (ADR 0018). */
const termsRefused = (tribe: Tribe, t: Translate): AdapterCheck => ({
  findings: [
    finding('error', t('cli.doctor.terms_refused', { tribe: tribe.id }), [
      t('cli.doctor.terms_hint', { tribe: tribe.id }),
    ]),
  ],
});

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
  // The login check comes once the terms are recorded. Which CLI wants them is its package's to say
  // (AdapterTool.terms, PS-23), not a name here.
  const terms = BUILT_IN_ADAPTERS[tribe.adapter]?.tool.terms === true;
  const refused = terms && next.data.tool?.terms_acknowledged_at === undefined;
  const adapter = refused ? termsRefused(tribe, t) : await adapterFindings(next.data, ctx);
  const findings = [
    finding('ok', t('cli.doctor.tool_found', { tribe: tribe.id, version: tool.version, path: tool.path })),
    ...uncheckedFindings(tribe, tool, ctx),
    ...adapter.findings,
    // Errors of the tribe's own (PS-27): its adapter runs the CLI elsewhere, or the characters reach the folder.
    ...(await configDirFindings(next.data, capabilities ?? {}, ctx)),
    // An error here is the tribe's own (P1-41): `--enable` keeps it off, its sessions could not run pnpm.
    ...(await shellFindings(tribe, capabilities, ctx)),
    ...promptMaxFindings(tribe, capabilities, ctx.io.platform, t),
    ...visionFindings(tribe, capabilities, t),
  ];
  const account = adapter.info === undefined ? {} : { account: { tribe: next.data, info: adapter.info } };
  const same = JSON.stringify(next.data) === JSON.stringify(stored);
  return same ? { findings, ...account } : { findings, updated: next.data, ...account };
}
