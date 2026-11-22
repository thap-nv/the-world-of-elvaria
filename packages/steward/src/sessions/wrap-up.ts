// The soft ceiling (F) of phase 2: an assignee's session past `breakers.soft_pct` of a ceiling gets `wrap-up.json` in
// its run folder and one `agent.session.wrap_up` line, once per session. The Elvaria hook of its tribe reads the file
// and tells the session to stop, commit and write its letter; the Steward only writes it, and the hard stop
// (`hard_pct`, breaker.ts) is what follows if the session ignores it. A judge gets none: it commits nothing, and a
// breaker already leaves its review to the next one. The owner's bell rings for both (wrap-up-bell.ts, PS-28b).
import { rm } from 'node:fs/promises';

import { currentRun, runDirOf, wrapUpsIn } from '@elvaria/domain';
import { inKingdom, readTextFile, writeFileAtomic } from '@elvaria/store';
import type { Quest, SessionReading, SessionWrapUp } from '@elvaria/domain';

import { STEWARD } from '../quest/record.ts';
import { ringWrapUp } from './wrap-up-bell.ts';
import type { Context } from '../context.ts';

const FILE = 'wrap-up.json';
const INDENT = 2;

/** `wrap-up.json` of the run, in the kingdom: `.runs/<quest>-<n>/wrap-up.json`. */
const fileOf = (ctx: Context, quest: Quest, n: number): string =>
  inKingdom(ctx.root, `${runDirOf(quest, n, 'assignee')}/${FILE}`);

/** The file's `measure` says minutes where the event says `time` (the contract of the hook, version 1). */
const measureNamed = (measure: SessionWrapUp['measure']): 'tokens' | 'minutes' | 'turns' =>
  measure === 'time' ? 'minutes' : measure;

/** A session that goes on in the run's folder starts without the file the one before it was given. */
export async function clearWrapUp(ctx: Context, quest: Quest, n: number): Promise<void> {
  try {
    await rm(fileOf(ctx, quest, n), { force: true });
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    ctx.deps.log.warn(`steward: ${quest.id}: ${FILE} of run ${String(n)} was not cleared: ${why}`);
  }
}

async function note(ctx: Context, quest: Quest, wrap: SessionWrapUp, session: string): Promise<void> {
  const { measure, used, limit, pct } = wrap;
  const target = fileOf(ctx, quest, currentRun(quest));
  // A Steward restarted over a file already written does not say it twice (the session itself went with the last one).
  if ((await readTextFile(target)) === undefined) {
    const body = { version: 1, measure: measureNamed(measure), used, limit, pct };
    await writeFileAtomic(target, `${JSON.stringify(body, null, INDENT)}\n`);
    await ctx.record.note({
      type: 'agent.session.wrap_up',
      actor: STEWARD,
      data: { measure, used, limit, pct },
      quest,
      session,
    });
  }
}

/**
 * Every tick: the sessions past the soft ceiling that were not told yet, from the readings of the tick (usage.ts reads
 * the held sessions once, for the reminders and the stamina, PS-28). An assignee's gets the file and the line; then the
 * owner's bell rings for it, and for a judge's too, which gets nothing else (PS-28b, TL4). `told` holds the session ids
 * already handled, in the Steward's state; a session ends once, so an id never comes back.
 */
export async function noteWrapUps(
  ctx: Context,
  told: Set<string>,
  readings: readonly SessionReading[],
): Promise<void> {
  for (const wrap of wrapUpsIn(readings)) {
    const running = ctx.sessions.get(wrap.quest);
    const quest = ctx.world.quests.get(wrap.quest);
    if (running?.role !== wrap.role || quest === undefined) continue;
    if (told.has(running.session_id)) continue;
    told.add(running.session_id);
    try {
      if (wrap.role === 'assignee') await note(ctx, quest, wrap, running.session_id);
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      ctx.deps.log.warn(`steward: ${quest.id}: no ${FILE}: ${why}`);
    }
    await ringWrapUp(ctx, quest, wrap);
  }
}
