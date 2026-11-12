// What the metrics read from the event log alone (PS-01b, implementation-plan §3.16.1): the runs of checks the Steward
// set aside because their environment failed, the files a session read more than once, and the files a submit
// changed outside its quest's scope (PS-05). Neither leaves a trace in
// a quest file, so a restarted Steward, the world and the Monk see them here or nowhere.
import { isEventOf } from '../schema/event/event.ts';
import { inWindow } from './window.ts';
import type { MetricsWindow } from './window.ts';
import type { QuestId } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';

/** A run of checks set aside because their environment failed (P1-54), from its `check.end` line. */
export interface SetAside {
  readonly quest: QuestId | null;
  readonly attempt: number | null;
  /** The first failing check whose log showed it. */
  readonly check: string;
  readonly at: string;
}

/** The set-aside runs inside the window, in the order they ended; a line written before PS-01b says none. */
export const setAsidesOf = (events: readonly Event[], window: MetricsWindow): SetAside[] =>
  events.flatMap((event) => {
    if (!isEventOf(event, 'check.end') || event.data.environment === undefined) return [];
    if (!inWindow(window, event.ts)) return [];
    const { quest, attempt } = event;
    return [
      { quest: quest ?? null, attempt: attempt ?? null, check: event.data.environment.check, at: event.ts },
    ];
  });

/** A file one session read more than once. */
export interface RepeatedRead {
  readonly session: string;
  readonly quest: QuestId | null;
  /** As the hook wrote it: relative to the plot with `/`, a file or the folder a search ran in. */
  readonly path: string;
  readonly reads: number;
}

export interface Reads {
  /** `agent.tool` lines of kind `read` that name a path, inside the window. */
  readonly total: number;
  /** The files a session read more than once, the most read first (Q10 of P1-50: 25 reads of one 1 MB file). */
  readonly repeated: readonly RepeatedRead[];
}

const byReads = (a: RepeatedRead, b: RepeatedRead): number =>
  b.reads - a.reads || a.session.localeCompare(b.session) || a.path.localeCompare(b.path);

/** The reads by file of each session (chosen 2026-11-11, after Q10 of P1-50); a line with no session is counted once. */
export function readsOf(events: readonly Event[], window: MetricsWindow): Reads {
  const bySession = new Map<string, RepeatedRead>();
  let total = 0;
  for (const event of events) {
    if (!isEventOf(event, 'agent.tool') || event.data.tool !== 'read') continue;
    const { path } = event.data;
    if (path === undefined || !inWindow(window, event.ts)) continue;
    total += 1;
    if (event.session === undefined) continue;
    const key = JSON.stringify([event.session, path]);
    const seen = bySession.get(key);
    const quest = seen?.quest ?? event.quest ?? null;
    bySession.set(key, { session: event.session, quest, path, reads: (seen?.reads ?? 0) + 1 });
  }
  return { total, repeated: [...bySession.values()].filter(({ reads }) => reads > 1).sort(byReads) };
}

/** A submit whose work changed files outside the quest's scope (PS-05, ADR 0028), from its `quest.submitted` line. */
export interface OutOfScope {
  readonly quest: QuestId | null;
  readonly at: string;
  readonly paths: readonly string[];
}

/** The submits inside the window that changed files outside their scope, in the order they came; older lines say none. */
export const outOfScopeOf = (events: readonly Event[], window: MetricsWindow): OutOfScope[] =>
  events.flatMap((event) => {
    if (!isEventOf(event, 'quest.submitted') || event.data.out_of_scope === undefined) return [];
    if (!inWindow(window, event.ts)) return [];
    return [{ quest: event.quest ?? null, at: event.ts, paths: event.data.out_of_scope }];
  });
