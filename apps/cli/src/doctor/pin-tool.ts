// What doctor and `tribe check` pin into `tribes[].tool` (implementation-plan §3.14): the CLI found, its version,
// the sign-in a first pin takes, the terms acknowledged (ADR 0018), and what a changed or unchecked pin says
// (A1a, A1b of the lessons of 2026-11-13). Split out of ./check-tribe.ts, which only orders the checks of a tribe.
import { defaultAuthOf } from '@elvaria/domain';
import type { AdapterCapabilities, Tribe } from '@elvaria/domain';

import { finding } from './finding.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

/** The doctor options a pin reads (DoctorOptions in ./check-tribe.ts extends it). */
export interface PinOptions {
  /** `--pin`: accept a CLI whose version or path differs from the pinned one. */
  readonly pin: boolean;
  /** `--acknowledge-terms <tribe>`: the owner accepts the provider's terms for that tribe (ADR 0018). */
  readonly acknowledge: ReadonlySet<string>;
}

export type Pinned = NonNullable<Tribe['tool']>;

/** The CLI doctor found: its path in portable form, the version it says, and where the path came from. */
export interface FoundTool {
  readonly path: string;
  readonly version: string;
  readonly from: string;
}

/**
 * The tool a passing `tribe check` with the real CLI pins for its tribe alone (B1 of the lessons of 2026-11-13): the
 * CLI it ran, path and version, that version the checked one (A1b); the sign-in, default model and terms stay.
 */
export const checkedToolOf = (pinned: Pinned, found: { path: string; version: string }): Pinned => ({
  ...pinned,
  path: found.path,
  version: found.version,
  checked_version: found.version,
});

/**
 * The tool to pin, or undefined when a pinned tool changed and the owner has not asked to re-pin. A first pin takes
 * the sign-in the adapter declares: the owner's login when it runs with one, Gemini CLI's paid key (ADR 0018). A
 * re-pin to another version keeps the old checked version (the pinned one when none was recorded): `doctor --pin`
 * is no check, and the Steward holds the tribe until `tribe check` passes on the new one (A1b).
 */
export function nextTool(
  tribe: Tribe,
  found: FoundTool,
  ctx: KingdomContext,
  options: PinOptions,
  capabilities: AdapterCapabilities | undefined,
) {
  const pinned = tribe.tool;
  const changed = pinned !== undefined && (pinned.version !== found.version || pinned.path !== found.path);
  if (changed && !options.pin && found.from !== 'flag') return undefined;
  const acknowledged = options.acknowledge.has(tribe.id) ? { terms_acknowledged_at: ctx.now() } : {};
  const checked = pinned?.checked_version ?? pinned?.version;
  const kept = pinned?.version === found.version || checked === undefined ? {} : { checked_version: checked };
  return {
    ...pinned,
    path: found.path,
    version: found.version,
    auth: pinned?.auth ?? defaultAuthOf(capabilities ?? { auth: [] }),
    ...kept,
    ...acknowledged,
  };
}

/**
 * A pinned CLI that changed. locateTool tries the pinned file before PATH, so one found on PATH means the pinned
 * file is gone (a VS Code extension update moves Claude Code's folder): the tribe cannot run until re-pinned,
 * which is an error. A file updated in place (agy) still runs, so a new version there is a warning, and the pin does
 * not hold it back: the next session runs the new version (agy 1.5.6 → 1.5.7 on 2026-11-13, with a new default
 * agent mode). Either way the hint sends the owner to `tribe check` with the real CLI before pinning (A1a of the
 * lessons of 2026-11-13).
 */
export function changedTool(tribe: Tribe, found: FoundTool, ctx: KingdomContext) {
  const params = {
    tribe: tribe.id,
    pinned: tribe.tool?.version ?? '',
    pinned_path: tribe.tool?.path ?? '',
    version: found.version,
    path: found.path,
  };
  const moved = found.from === 'path';
  const hint = [ctx.t(moved ? 'cli.doctor.moved_hint' : 'cli.doctor.pin_hint', params)];
  return moved
    ? finding('error', ctx.t('cli.doctor.tool_moved', params), hint)
    : finding('warn', ctx.t('cli.doctor.tool_changed', params), hint);
}

/**
 * A pinned version no `tribe check` with the real CLI passed on (`doctor --pin` re-pinned it): the Steward holds the
 * tribe until one does (A1b), so doctor says so, as a warning with the command.
 */
export function uncheckedFindings(tribe: Tribe, tool: Pinned, ctx: KingdomContext): Finding[] {
  const checked = tool.checked_version;
  if (checked === undefined || checked === tool.version) return [];
  const params = { tribe: tribe.id, version: tool.version, checked };
  return [
    finding('warn', ctx.t('cli.doctor.tool_unchecked', params), [ctx.t('cli.doctor.pin_hint', params)]),
  ];
}
