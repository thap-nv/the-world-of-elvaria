// Holding a tribe whose CLI changed since a check with the real CLI last passed (A1b of the lessons of 2026-11-13):
// agy replaced agy.exe in place from 1.5.6 with 1.5.7 under a pinned version, and `tribe check gemini` with the real
// agy then passed 3 of 7 checks, while the Steward would have handed the tribe new sessions on it. A VS Code update
// also removes the folder of a pinned CLI (Claude Code, Codex on 2026-11-14): every session of the tribe then fails to
// start. Pure: the Steward finds what each CLI says (`<cli> --version`, no model call); planTick holds (roster.ts).
import type { TribeId } from '../core/ids.ts';
import type { Tribe } from '../schema/tribe.ts';

/** The CLI a tribe's runner starts, as the Steward found it. */
export interface ToolFound {
  /** Its path, portable. */
  readonly path: string;
  /** What it says with `--version`; undefined when the file is gone. */
  readonly version: string | undefined;
}

/** What the Steward found of each tribe's CLI; a tribe whose CLI it could not ask (no answer in time) is absent. */
export type ToolsFound = Readonly<Partial<Record<TribeId, ToolFound>>>;

/**
 * A tribe the Steward opens no new session for: its CLI at `path` says `version`, not `checked`, the version its last
 * passing check ran on; or (`version` undefined) the CLI is gone.
 */
export interface TribeHold extends ToolFound {
  readonly tribe: TribeId;
  readonly checked: string;
}

/**
 * The version a tribe's CLI must say for a new session: the one the last `tribe check` with the real CLI passed on,
 * else the pinned one. A kingdom from before `checked_version` keeps working on the version it pinned, so an upgrade
 * holds only the tribes whose CLI has already moved; `doctor --pin` keeps the old one as the checked one for them.
 * Undefined: nothing pinned, nothing to hold to.
 */
export const checkedVersionOf = (tribe: Pick<Tribe, 'tool'>): string | undefined =>
  tribe.tool?.checked_version ?? tribe.tool?.version;

/**
 * The hold that keeps `tribe` from a new session, if any. A session outside planTick (the Chancellor's triage and the
 * owner's words, an amendment's author) waits on it as planTick's roster does (fix/held-tribe-sessions).
 */
export const holdOf = (holds: readonly TribeHold[], tribe: TribeId): TribeHold | undefined =>
  holds.find((hold) => hold.tribe === tribe);

/**
 * The tribes whose CLI is gone or says another version than the checked one, in kingdom order. A CLI that did not
 * answer holds nothing: no version is no proof it changed (a busy machine), and its sessions say what is wrong.
 */
export function versionHoldsOf(
  tribes: readonly Pick<Tribe, 'id' | 'tool'>[],
  found: ToolsFound,
): TribeHold[] {
  return tribes.flatMap((tribe) => {
    const tool = found[tribe.id];
    const checked = checkedVersionOf(tribe);
    return tool === undefined || checked === undefined || tool.version === checked
      ? []
      : [{ tribe: tribe.id, ...tool, checked }];
  });
}
