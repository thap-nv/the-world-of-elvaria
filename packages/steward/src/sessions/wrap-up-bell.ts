// The bell at the reminder mark (PS-28b, docs/plans/session-stamina.md, TL4): the owner hears of a session past
// `soft_pct` once per session, an assignee's or a judge's, with what a raise must reach to lift its ceiling. Measured on
// a real run (lần (J)): about five minutes from the mark to the cut, so the notice carries the command's figure and the
// owner need not look anything up. The bell decides nothing: the breakers still cut at `hard_pct` (ADR 0030).
import { calibrationOf, tokenCeilingFor } from '@elvaria/domain';
import type { Quest, SessionWrapUp } from '@elvaria/domain';

import { noticeQuest, ring } from '../context.ts';
import type { Context } from '../context.ts';

/** The smallest figure of the command that lifts the gauge's ceiling; none for turns, which have no knob per quest. */
function raiseFrom(ctx: Context, quest: Quest, wrap: SessionWrapUp): number | undefined {
  if (wrap.measure === 'time') return quest.budget.max_minutes + 1;
  if (wrap.measure === 'turns') return undefined;
  const { world } = ctx;
  const rules = { ...world.kingdom.breakers, characters: world.characters, tribes: world.kingdom.tribes };
  const calibration = calibrationOf([...world.quests.values()], world.characters, world.kingdom);
  return tokenCeilingFor(quest, wrap.role, rules, calibration).raise_from;
}

/** Rings `wrap_up` for a session past the mark: the reading's own figures, and the cut its breaker holds it to. */
export async function ringWrapUp(ctx: Context, quest: Quest, wrap: SessionWrapUp): Promise<void> {
  const { measure, used, limit, role } = wrap;
  const from = raiseFrom(ctx, quest, wrap);
  await ring(ctx, {
    kind: 'wrap_up',
    quest: noticeQuest(quest),
    role,
    character: (role === 'assignee' ? quest.assignee : quest.verifier) ?? null,
    measure,
    used,
    limit,
    cut_at: (limit * ctx.world.kingdom.breakers.hard_pct) / 100,
    ...(from === undefined ? {} : { raise_from: from }),
  });
}
