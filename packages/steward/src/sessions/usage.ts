// A running session's stamina in the log (PS-28, docs/plans/session-stamina.md): every tick the Steward reads each held
// session once (sessionReadingsOf: what the breakers say of it, and its bar) and writes one `agent.session.usage` line,
// to the day's log and the quest's journal, when the bar moved a notch or the ceiling of its gauge changed
// (staminaMoved). For an assignee and a judge alike; the line changes nothing for the session, and nothing keeps the
// bar: `sessionStaminaOf` folds these lines back into it. The book of what was written lives in the Steward's memory,
// as the reminders' does: a session never outlives the Steward that opened it (restart.ts reaps it), so a restarted
// Steward has nothing of the last one's to say again.
import { calibrationOf, measureOf, sessionReadingsOf, staminaMoved } from '@elvaria/domain';
import type { Instant, SessionReading, StaminaMark } from '@elvaria/domain';

import { STEWARD } from '../record.ts';
import type { Context } from '../context.ts';

/**
 * Every held session read against its ceilings once, at `now`, for the reminders and the stamina of this tick. The
 * tick hands `planTick` the same instant, so the line written and the cut decided see the same minutes.
 */
export function heldReadingsOf(ctx: Context, now: Instant): SessionReading[] {
  const { world, limits } = ctx;
  const rules = { ...world.kingdom.breakers, characters: world.characters, tribes: world.kingdom.tribes };
  const quests = [...world.quests.values()];
  const measure = measureOf(world.characters, limits);
  const calibration = calibrationOf(quests, world.characters, world.kingdom);
  return sessionReadingsOf(quests, ctx.sessions.held(), rules, now, measure, calibration);
}

/** The data of the line: the gauge the bar follows and the thresholds in force, so a reader needs no kingdom.json. */
const dataOf = ({ stamina }: SessionReading) => {
  const { role, measure, used, limit, pct, soft_pct, hard_pct } = stamina;
  return { role, measure, used, limit, pct, soft_pct, hard_pct };
};

/**
 * Every tick, before the plan can cut a session: a line for each held session whose bar moved since the last one
 * written. `book` holds the notch, gauge and ceiling last written per session id, and forgets the sessions no longer
 * held, so a session resumed under its own id starts over.
 */
export async function noteStamina(
  ctx: Context,
  book: Map<string, StaminaMark>,
  readings: readonly SessionReading[],
): Promise<void> {
  for (const reading of readings) {
    const running = ctx.sessions.get(reading.quest);
    const quest = ctx.world.quests.get(reading.quest);
    if (running?.role !== reading.role || quest === undefined) continue;
    const { notch, measure, limit } = reading.stamina;
    if (!staminaMoved(book.get(running.session_id), reading.stamina)) continue;
    book.set(running.session_id, { notch, measure, limit });
    try {
      await ctx.record.note({
        type: 'agent.session.usage',
        actor: STEWARD,
        data: dataOf(reading),
        quest,
        session: running.session_id,
      });
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      ctx.deps.log.warn(`steward: ${quest.id}: no agent.session.usage line: ${why}`);
    }
  }
  const held = new Set(ctx.sessions.held().map(({ quest }) => ctx.sessions.get(quest)?.session_id));
  for (const session of book.keys()) if (!held.has(session)) book.delete(session);
}
