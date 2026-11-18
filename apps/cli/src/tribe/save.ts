// How `elvaria tribe` writes `kingdom.tribes[]` (implementation-plan §3.14; ADR 0005: kingdom.json is not quest or
// character state, and the tribe commands join init and doctor as the CLI's writers of it, P1-19). Every write goes
// through the kingdom file's lock and changes only the tribes, leaving what another command wrote as it is on disk.
import { err, ok } from '@elvaria/domain';
import type { Kingdom, Result, Tribe, TribeId } from '@elvaria/domain';

import { storeIssueLines } from '../issues.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** Why a tribe change cannot be made, as one line in the owner's language. */
export interface TribeRefusal {
  readonly code: 'tribe_refused';
  readonly line: string;
}

export const refuse = (line: string): TribeRefusal => ({ code: 'tribe_refused', line });

/** Writes the tribes `change` makes of the ones on disk; true once written, false once the reason is printed. */
export async function saveTribes(
  ctx: KingdomContext,
  change: (tribes: readonly Tribe[]) => Result<Tribe[], TribeRefusal>,
): Promise<boolean> {
  const saved = await ctx.store.kingdom.update((current: Kingdom) => {
    const next = change(current.tribes);
    return next.ok ? ok({ ...current, tribes: next.value }) : next;
  });
  if (saved.ok) return true;
  const lines =
    saved.error.code === 'tribe_refused' ? [saved.error.line] : storeIssueLines(ctx.t, saved.error);
  lines.forEach(ctx.io.err);
  return false;
}

/** The tribe named on the command line, as kingdom.json holds it, or undefined once the reason is printed. */
export function namedTribe(ctx: KingdomContext, id: string | undefined): Tribe | undefined {
  const tribe = ctx.kingdom.tribes.find((entry) => entry.id === id);
  if (tribe !== undefined) return tribe;
  const tribes = ctx.kingdom.tribes.map((entry) => entry.id).join(', ');
  ctx.io.err(ctx.t('cli.tribe.unknown', { tribe: id ?? '', tribes }));
  return undefined;
}

/**
 * One tribe as `change` makes it of the row on disk, written under the lock; the tribes as written, or undefined once
 * the reason is printed (the tribe may have been removed by hand meanwhile).
 */
export async function updateTribe(
  ctx: KingdomContext,
  tribe: TribeId,
  change: (entry: Tribe) => Tribe,
): Promise<readonly Tribe[] | undefined> {
  let written: readonly Tribe[] | undefined;
  const saved = await saveTribes(ctx, (tribes) => {
    if (!tribes.some(({ id }) => id === tribe)) {
      const known = tribes.map(({ id }) => id).join(', ');
      return err(refuse(ctx.t('cli.tribe.unknown', { tribe, tribes: known })));
    }
    const next = tribes.map((entry) => (entry.id === tribe ? change(entry) : entry));
    written = next;
    return ok(next);
  });
  return saved ? written : undefined;
}

/** `enabled` of one tribe, set under the lock. */
export const setEnabled = async (ctx: KingdomContext, tribe: Tribe, enabled: boolean): Promise<boolean> =>
  (await updateTribe(ctx, tribe.id, (entry) => ({ ...entry, enabled }))) !== undefined;
