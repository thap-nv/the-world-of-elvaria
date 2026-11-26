// heal.patch (ADR 0034, plans/healer.md 4.4): what a healer changed of the doer's refused work, as the Steward
// measured it, kept in the run's `heal/` folder before the commit through the hooks. The run's judge reads it beside
// the branch's diff; the judge cannot read `.runs/`, so its prompt copies it.
import { readFile } from 'node:fs/promises';

import { healedBy } from '@elvaria/domain';
import { redact } from '@elvaria/eventlog';
import { inKingdom, writeFileAtomic } from '@elvaria/store';
import type { Quest } from '@elvaria/domain';
import type { HealPatch } from '@elvaria/runner-core';

import { healDirOf } from './tree.ts';
import type { Context } from '../context.ts';

/** `.runs/<quest>-<n>/heal/heal.patch`, relative to the kingdom: the path the submit's `heal` names. */
export const healPatchOf = (quest: Quest): string => `${healDirOf(quest)}/heal.patch`;

/** Writes heal.patch, masked with the session's own values and the patterns (ADR 0013); its path in the kingdom. */
export async function keepHealPatch(
  ctx: Context,
  quest: Quest,
  patch: string,
  known: readonly string[],
): Promise<string> {
  const file = healPatchOf(quest);
  await writeFileAtomic(inKingdom(ctx.root, file), redact(patch, known));
  return file;
}

/**
 * The healer's change the judge of run `n` reads (heal-patch.md): its heal.patch when a healer's heal of the run went
 * to review (healedBy), masked again with `known`; none otherwise, or when the file cannot be read.
 */
export async function healPatchFor(
  ctx: Context,
  quest: Quest,
  n: number,
  known: readonly string[],
): Promise<HealPatch | null> {
  const healer = healedBy(quest, n);
  if (healer === undefined) return null;
  try {
    const patch = await readFile(inKingdom(ctx.root, healPatchOf(quest)), 'utf8');
    return { healer, patch: redact(patch, known) };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    ctx.deps.log.warn(`steward: ${quest.id}: the judge reads no heal.patch: ${why}`);
    return null;
  }
}
