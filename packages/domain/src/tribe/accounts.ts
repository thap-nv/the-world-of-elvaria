// Two tribes on one account (PS-27, ADR 0021). A second account of one CLI is a tribe of its own with its own mana
// pool, so two login tribes of one adapter must not share the CLI's config directory or the account signed in
// there: both pools would measure one account, and the Steward would spend its limit twice. Pure: the caller asks
// each adapter (`runner.doctor()`) and normalises the paths first; doctor and `tribe check` report the clashes.
import type { TribeId } from '../core/ids.ts';
import type { TribeAuth } from '../schema/tribe.ts';

/** One tribe as the rule sees it. */
export interface AccountRow {
  readonly id: TribeId;
  readonly adapter: string;
  readonly auth: TribeAuth;
  /**
   * The config directory the CLI says it uses, else the one the tribe names, normalised by the caller (`/`, no `/`
   * at the end, lower case where the file system ignores case). Absent: the CLI's own default.
   */
  readonly config_dir?: string;
  /** A fingerprint of the account signed in there (`ToolInfo.account`), when the adapter reads one. */
  readonly account?: string;
}

export const ACCOUNT_CLASH_CODES = ['same_config_dir', 'same_account'] as const;
export type AccountClashCode = (typeof ACCOUNT_CLASH_CODES)[number];

/** Two tribes that would run on one account. */
export interface AccountClash {
  readonly code: AccountClashCode;
  readonly tribes: readonly [TribeId, TribeId];
  /** The directory both run in (same_config_dir); absent when both run in the CLI's default. */
  readonly config_dir?: string;
}

/**
 * The clash of two rows, if any. One directory is one account, so a shared directory is all that is said of a pair
 * even when the fingerprints match too; a shared fingerprint alone means the owner signed in to the same account in
 * two directories.
 */
function clashOf(row: AccountRow, other: AccountRow): AccountClash | undefined {
  if (row.adapter !== other.adapter) return undefined;
  const tribes = [row.id, other.id] as const;
  if (row.config_dir === other.config_dir) {
    const dir = row.config_dir === undefined ? {} : { config_dir: row.config_dir };
    return { code: 'same_config_dir', tribes, ...dir };
  }
  if (row.account !== undefined && row.account === other.account) return { code: 'same_account', tribes };
  return undefined;
}

/**
 * Every pair of login tribes of one adapter that would run on one account, in the order of `rows`: the same config
 * directory (two tribes that name none share the default), or the same account fingerprint. A tribe signed in with
 * a key from the treasury is not weighed, as its sign-in lives in no directory.
 */
export function accountClashesOf(rows: readonly AccountRow[]): AccountClash[] {
  const logins = rows.filter((row) => row.auth === 'login');
  return logins.flatMap((row, at) =>
    logins.slice(at + 1).flatMap((other) => {
      const clash = clashOf(row, other);
      return clash === undefined ? [] : [clash];
    }),
  );
}
