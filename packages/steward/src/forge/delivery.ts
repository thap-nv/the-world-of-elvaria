// What one piece of a delivery works with (PS-08c, PS-08d): the quest, its territory, the forge's adapter and the
// repo there, git as a delivery runs it, the quest branch and its plot, and the Steward's stop. Found before the first
// step of a push (push.ts) and of each question about its pull request (merge.ts); what is missing fails the delivery
// once. Apart from push.ts since PS-08d, which both use.
import { deliveryOf, err, ok } from '@elvaria/domain';
import { fromPortable } from '@elvaria/store';
import type { Quest, Result, Territory } from '@elvaria/domain';

import { STEWARD } from '../quest/record.ts';
import type { Context } from '../context.ts';
import type { DeliveryGit } from './git.ts';
import type { Forge, ForgeRepo } from './forge.ts';
import type { Failure } from './outcome.ts';

export interface Delivery {
  readonly quest: Quest;
  readonly territory: Territory;
  readonly forge: Forge;
  readonly repo: ForgeRepo;
  readonly git: DeliveryGit;
  readonly branch: string;
  /** vcs.default_branch, which a git territory always has (TerritorySchema). */
  readonly base: string;
  readonly worktree: string;
  readonly signal: AbortSignal;
}

/** Where git runs for a piece of a delivery: the plot, or (CM-08) the territory's repo for a delivery train. */
export type GitPlace = Pick<Delivery, 'git' | 'worktree' | 'signal'>;

export const forgeError = (branch: string, detail: string): Failure => ({
  stage: 'push',
  reason: 'forge_error',
  branch,
  detail,
});

/** The forge's adapter, the repo, git and the plot; what is missing fails the delivery once. */
export function foundOf(ctx: Context, quest: Quest, signal: AbortSignal): Result<Delivery, Failure> {
  const territory = ctx.world.territories.get(quest.territory);
  const { branch = '', path = '' } = quest.plot;
  if (territory === undefined) return err(forgeError(branch, 'the territory is gone'));
  const id = deliveryOf(territory).forge;
  const forge = ctx.deps.forges?.adapters[id];
  if (forge === undefined || ctx.deps.forges === undefined)
    return err(forgeError(branch, `this Steward has no adapter for the forge ${id}`));
  const repo = forge.repoOf(territory.vcs.remote ?? '', fromPortable(territory.path));
  const base = territory.vcs.default_branch;
  if (repo === undefined || base === undefined)
    return err(forgeError(branch, `vcs.remote names no repo on ${id}`));
  const git = { launch: ctx.deps.forges.git, env: ctx.deps.env };
  return ok({ quest, territory, forge, repo, git, branch, base, worktree: fromPortable(path), signal });
}

/** The Steward stopped: asked anew after each await, which TypeScript's narrowing cannot see. */
export const stopped = (d: Delivery): boolean => d.signal.aborted;

/** A forge's message as a failure's `detail`, when it has one. */
export const detailOf = (detail: string | undefined) =>
  detail === undefined || detail === '' ? {} : { detail };

export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A line of the log about the delivery's quest; one that cannot be written costs the owner a line, never the delivery. */
export async function deliveryNote(
  ctx: Context,
  d: Delivery,
  line: { readonly type: string; readonly data: Record<string, unknown> },
): Promise<void> {
  try {
    await ctx.record.note({ ...line, actor: STEWARD, quest: d.quest });
  } catch (error) {
    ctx.deps.log.warn(`steward: ${d.quest.id}: no ${line.type} line: ${messageOf(error)}`);
  }
}
