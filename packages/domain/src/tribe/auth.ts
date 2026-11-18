// Which sign-in a tribe runs with, checked against what its adapter declares (implementation-plan §3.14, ADR 0021;
// P1-19, decided after P0-11). Until P1-19 TribeSchema held "adapter gemini_cli ⇒ auth api_key", a rule naming one
// CLI inside the core; now each adapter declares `capabilities.auth` and `elvaria doctor` and `elvaria tribe check`
// call these two functions, so the core never asks which CLI a tribe runs. checkTribeConfigDir holds the config
// directory a tribe names to the same kind of declaration (PS-27).
import { err, ok } from '../core/result.ts';
import type { Result } from '../core/result.ts';
import type { Tribe, TribeAuth } from '../schema/tribe.ts';
import type { AdapterCapabilities } from './capabilities.ts';

/** The sign-in `tribes[].tool.auth` names is not one the adapter runs with. */
export interface TribeAuthIssue {
  readonly code: 'auth_not_declared';
  readonly auth: TribeAuth;
  readonly declared: readonly TribeAuth[];
}

/** The tribe names a config directory (`tool.config_dir`) its adapter does not run its CLI in (PS-27). */
export interface TribeConfigDirIssue {
  readonly code: 'config_dir_not_declared';
}

/**
 * The sign-in doctor pins when it first fills a tribe's tool: the owner's own login whenever the adapter runs with
 * it (no money changes hands), else the first the adapter declares; login when it declares none.
 */
export function defaultAuthOf(caps: Pick<AdapterCapabilities, 'auth'>): TribeAuth {
  return caps.auth.includes('login') ? 'login' : (caps.auth[0] ?? 'login');
}

/**
 * Whether the tribe's pinned sign-in is one its adapter declares. A tribe whose tool is not pinned yet has nothing
 * to check: doctor fills it with defaultAuthOf.
 */
export function checkTribeAuth(
  caps: Pick<AdapterCapabilities, 'auth'>,
  tribe: Pick<Tribe, 'tool'>,
): Result<void, TribeAuthIssue> {
  const auth = tribe.tool?.auth;
  if (auth === undefined || caps.auth.includes(auth)) return ok(undefined);
  return err({ code: 'auth_not_declared', auth, declared: caps.auth });
}

/**
 * Whether the tribe's adapter runs its CLI in the config directory the tribe names (PS-27). An adapter that does not
 * declare `capabilities.config_dir` would quietly run every session on the CLI's default account, another tribe's
 * perhaps, so a tribe naming a directory there is refused. A tribe naming none has nothing to check.
 */
export function checkTribeConfigDir(
  caps: Pick<AdapterCapabilities, 'config_dir'>,
  tribe: Pick<Tribe, 'tool'>,
): Result<void, TribeConfigDirIssue> {
  if (tribe.tool?.config_dir === undefined || caps.config_dir === true) return ok(undefined);
  return err({ code: 'config_dir_not_declared' });
}
