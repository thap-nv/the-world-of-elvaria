// The Steward's own lines (LL-04, plans/learning-loop.md §4.3): steward.started once it holds the lock and has read the
// log, saying how the Steward before it ended, and steward.stopped as the last line of its stop. A start that finds a
// start as the last of these follows a Steward that died without its stop (L35); a stop with sessions running cut
// them (L25). Nothing else reads them: the restart itself still goes by the files and the log (restart.ts).
import { CommitShaSchema } from '@elvaria/domain';
import type { Event, Instant, StewardPrevious, StewardStopReason } from '@elvaria/domain';

import { STEWARD, appendLine } from '../quest/record.ts';
import type { Held } from './steward-state.ts';
import type { StewardDeps } from '../types.ts';

const MS_PER_MINUTE = 60_000;
const OWN_LINES: ReadonlySet<string> = new Set(['steward.started', 'steward.stopped']);

type StartData = Readonly<{ build: string | null; previous: StewardPrevious; down_minutes?: number }>;

const minutesSince = (ts: string, now: Instant): number =>
  Math.max(0, Math.floor((now - Date.parse(ts)) / MS_PER_MINUTE));

/**
 * What a start says, from the log before it. Clean: down since the stop line. Unclean: since the last line the log
 * holds, the dead Steward's last word or a later one by the CLI, so at most the time the kingdom was down. A build
 * that is no full commit id (a source tree, a mark set by hand) is none.
 */
export function startDataOf(events: readonly Event[], now: Instant, build: string | undefined): StartData {
  const sha = CommitShaSchema.safeParse(build);
  const base = { build: sha.success ? sha.data : null };
  const last = events.findLast((event) => OWN_LINES.has(event.type));
  if (last === undefined) return { ...base, previous: 'first' };
  if (last.type === 'steward.stopped')
    return { ...base, previous: 'clean', down_minutes: minutesSince(last.ts, now) };
  return { ...base, previous: 'unclean', down_minutes: minutesSince((events.at(-1) ?? last).ts, now) };
}

const stampOf = (deps: StewardDeps, held: Held): string => held.zone.format(deps.clock.now());

export async function noteStart(deps: StewardDeps, held: Held, events: readonly Event[]): Promise<void> {
  const data = startDataOf(events, deps.clock.now(), deps.build);
  await appendLine(deps, { type: 'steward.started', actor: STEWARD, data }, stampOf(deps, held));
}

/** `sessions`: those running when the stop began, which it killed. */
export async function noteStop(
  deps: StewardDeps,
  held: Held,
  reason: StewardStopReason,
  sessions: number,
): Promise<void> {
  const data = { reason, sessions };
  await appendLine(deps, { type: 'steward.stopped', actor: STEWARD, data }, stampOf(deps, held));
}
