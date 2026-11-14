// `doctor` in the trial of `elvaria upgrade` ((17) of the owner's settlement after wave 6, fix/held-tribe-sessions):
// a tribe this build's Steward holds anyway, its CLI gone or on another version than its last passing check
// (versionHoldsOf), opens no session until `tribe check` passes, so its errors do not stop the upgrade. On 2026-11-14 a
// VS Code update removed Codex's pinned file, the new build's doctor failed on the copy, and every upgrade was refused
// until a `tribe check codex` run with the new code (`--here`). `elvaria upgrade` says it is trying through an env
// variable, not an option: a build from before this change ignores it and fails as before, where an unknown option
// would fail every trial of an older ref (`upgrade --ref`). `doctor` run by the owner reports the errors as ever.
import { holdOf } from '@elvaria/domain';

import { crewOf } from '../run/crew.ts';
import { tribeHoldsOf } from '../run/tool-found.ts';
import { finding } from './finding.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { TribeCheck } from './check-tribe.ts';
import type { Finding } from './finding.ts';

/** Set to `1` by `elvaria upgrade` for the new build's doctor on its copy of the kingdom. */
export const UPGRADE_TRIAL_ENV = 'ELVARIA_UPGRADE_TRIAL';

/**
 * The findings of each tribe in kingdom order (`checks` follows `ctx.kingdom.tribes`); in the trial of an upgrade, a
 * held tribe's errors are warnings, with a line that says why and which check ends the hold.
 */
export async function tribeFindings(ctx: KingdomContext, checks: readonly TribeCheck[]): Promise<Finding[]> {
  if (ctx.io.env[UPGRADE_TRIAL_ENV] !== '1') return checks.flatMap(({ findings }) => findings);
  const { runners } = await crewOf({ kingdom: ctx.kingdom, root: ctx.store.root }, ctx.io);
  const holds = await tribeHoldsOf(ctx.kingdom, runners, ctx.io);
  return checks.flatMap(({ findings }, index) => {
    const tribe = ctx.kingdom.tribes[index];
    if (tribe === undefined || holdOf(holds, tribe.id) === undefined) return findings;
    const eased = findings.map((item) =>
      item.level === 'error' ? { ...item, level: 'warn' as const } : item,
    );
    return [...eased, finding('warn', ctx.t('cli.doctor.held_in_trial', { tribe: tribe.id }))];
  });
}
