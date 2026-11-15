// The soft ceiling (F) of phase 2: an assignee's session past `breakers.soft_pct` of a ceiling gets `wrap-up.json` in
// its run folder and one `agent.session.wrap_up` line, once per session. The Elvaria hook of its tribe reads the file
// and tells the session to stop, commit and write its letter; the Steward only writes it, and the hard stop
// (`hard_pct`, breaker.ts) is what follows if the session ignores it. A judge gets none: it commits nothing, and a
// breaker already leaves its review to the next one.
import { rm } from 'node:fs/promises';

import { currentRun, measureOf, runDirOf, wrapUpsOf } from '@elvaria/domain';
import { inKingdom, readTextFile, writeFileAtomic } from '@elvaria/store';
import type { Quest, SessionWrapUp } from '@elvaria/domain';

import { STEWARD } from '../record.ts';
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
 * Every tick: the assignees' sessions past the soft ceiling that were not told yet. `told` holds the session ids
 * already handled, in the Steward's state; a session ends once, so an id never comes back.
 */
export async function noteWrapUps(ctx: Context, told: Set<string>): Promise<void> {
  const { world, limits } = ctx;
  const rules = { ...world.kingdom.breakers, characters: world.characters, tribes: world.kingdom.tribes };
  const quests = [...world.quests.values()];
  const measure = measureOf(world.characters, limits);
  const wraps = wrapUpsOf(quests, ctx.sessions.held(), rules, ctx.deps.clock.now(), measure);
  for (const wrap of wraps) {
    const running = ctx.sessions.get(wrap.quest);
    const quest = world.quests.get(wrap.quest);
    if (running?.role !== 'assignee' || wrap.role !== 'assignee' || quest === undefined) continue;
    if (told.has(running.session_id)) continue;
    told.add(running.session_id);
    try {
      await note(ctx, quest, wrap, running.session_id);
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      ctx.deps.log.warn(`steward: ${quest.id}: no ${FILE}: ${why}`);
    }
  }
}
