// The delegation of the seal as the Steward carries it out (implementation-plan §3.16.7, ADR 0023; PS-08b): the
// domain decides (sealDelegated, sealRaisesOf, mayMergeUnsealed); this reads what it needs from the world and the plot.
// At a submit the Steward measures the branch (Plots.diffLines) and gathers the reasons the work gives; at a passing
// verdict, the reasons the judge gives; both go into the move's `before`, so the transition table does not change.
import { apartFromDoers, raisedSeal, sealPolicyOf, sealRaisesOf, workedOn } from '@elvaria/domain';
import type { CharacterId, Quest, SealFacts } from '@elvaria/domain';

import { outOfScopeIn } from './sessions/out-of-scope.ts';
import { modelsOf } from './world.ts';
import type { Context } from './context.ts';

/** The fields a move sets when the machine raises the seal now (raisedSeal); none for a quest the delegation did not spare. */
export function sealRaiseOf(ctx: Context, quest: Quest, facts: SealFacts): Partial<Quest> {
  const raises = sealRaisesOf(
    quest,
    facts,
    ctx.world.territories.get(quest.territory),
    sealPolicyOf(ctx.world.kingdom, ctx.delegation.suspensions),
  );
  return raisedSeal(quest, raises) ?? {};
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * The lines the branch of a quest the delegation spared added and removed since it forked, the territory's shared
 * paths merged by `regenerate` aside; undefined for any other quest, null when the plot cannot say (logged), which
 * sealRaisesOf takes as over the ceiling. Plots without the measure (folder plots) cannot say either.
 */
export async function diffLinesOf(ctx: Context, quest: Quest): Promise<number | null | undefined> {
  if (quest.seal_delegated !== true) return undefined;
  const generated = (ctx.world.territories.get(quest.territory)?.shared_paths ?? [])
    .filter(({ merge }) => merge === 'regenerate')
    .map(({ glob }) => glob);
  try {
    return (await ctx.deps.plots.diffLines?.(quest.plot, generated)) ?? null;
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: the size of its diff is unknown: ${messageOf(error)}`);
    return null;
  }
}

/** What a submit sets and writes on its line: the raise, the files outside the scope (PS-05) and the diff's size. */
export interface SubmitSeal {
  readonly before: Partial<Quest>;
  readonly out_of_scope: readonly string[];
  readonly diff_lines?: number;
}

/**
 * At a submit (sessions/submit.ts, the owner's `submit`): the files the work changed outside the quest's scope and, for
 * a quest the delegation spared, the size of its branch, both on the `quest.submitted` line; and the seal they raise,
 * with the protected paths the work changed (`changed`, protectedMarkOf sets the seal itself).
 */
export async function submitSealOf(
  ctx: Context,
  quest: Quest,
  changed: readonly string[],
): Promise<SubmitSeal> {
  const outside = await outOfScopeIn(ctx, quest);
  const lines = await diffLinesOf(ctx, quest);
  const facts = { protected: changed.length > 0, out_of_scope: outside };
  const before = sealRaiseOf(ctx, quest, lines === undefined ? facts : { ...facts, diff_lines: lines });
  return { before, out_of_scope: outside, ...(typeof lines === 'number' ? { diff_lines: lines } : {}) };
}

/** The fields of a submit's line (Move.out_of_scope, Move.diff_lines). */
export const lineOf = ({ out_of_scope: outside, diff_lines: lines }: SubmitSeal) => ({
  out_of_scope: outside,
  ...(lines === undefined ? {} : { diff_lines: lines }),
});

/** Who passed the quest: the machine alone, or a judge apart from every doer's family (apartFromDoers) or not. */
export function judgeOf(
  ctx: Context,
  quest: Quest,
  judge: CharacterId | 'machine',
): NonNullable<SealFacts['judge']> {
  if (judge === 'machine') return 'machine';
  const character = ctx.world.characters.get(judge);
  const doers = workedOn(quest).flatMap((id) => ctx.world.characters.get(id) ?? []);
  // A judge whose file is gone has no family to tell apart: counted as the same, as an unknown family is.
  if (character === undefined) return 'same_family';
  return apartFromDoers(character, doers, modelsOf(ctx.deps.runners)) ? 'apart' : 'same_family';
}

/** The fields a passing verdict sets: the reasons its judge and the review give (sealRaisesOf). */
export const passRaiseOf = (ctx: Context, quest: Quest, judge: CharacterId | 'machine'): Partial<Quest> =>
  sealRaiseOf(ctx, quest, { judge: judgeOf(ctx, quest, judge), objection: quest.objection !== undefined });
