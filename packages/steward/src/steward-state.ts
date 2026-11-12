// What a Steward holds while it runs and keeps between ticks (implementation-plan §3.1). Apart from steward.ts, which
// creates it, since PS-03: the tick (tick.ts) and the loop (loop.ts) work on it too.
import type { QuestId, TribeId, TribeLimits, ZonedTime } from '@elvaria/domain';
import type { PromptTemplates } from '@elvaria/runner-core';
import type { HeldLock } from '@elvaria/store';

import type { Background } from './background.ts';
import type { JudgeLocks } from './review/exclusive.ts';
import type { ManaBook } from './mana/book.ts';
import type { Restart } from './restart.ts';
import type { Sessions } from './sessions/running.ts';
import type { Reported } from './unclaimable.ts';

export interface Held {
  readonly lock: HeldLock;
  readonly zone: ZonedTime;
  readonly templates: PromptTemplates;
  readonly tickMs: number;
}

/** What a Steward keeps between ticks. */
export interface State {
  readonly sessions: Sessions;
  /** Command ids the log has answered (command.applied, command.rejected). */
  readonly handled: Set<string>;
  readonly limits: Partial<Record<TribeId, TribeLimits>>;
  readonly mana: ManaBook;
  /** Checks and scripts running outside the tick (P1-25): stop() kills them, the next start runs them again. */
  readonly background: Background;
  /** Exclusive locks held for judges in their scratch plots (P1-20): stop() releases them. */
  readonly judgeLocks: JudgeLocks;
  reported: Reported;
  /** Aborted by stop(): a tick it stops in starts no other script. */
  stopping: AbortController;
  /** Submitted quests the bell already named for having no judge in the roster (unjudgeable.ts, P1-15). */
  readonly unjudged: Set<QuestId>;
  /** Set by start(): what the first tick finishes of the last Steward's work (restart.ts, P1-44). */
  restart: Restart | undefined;
  held: Held | undefined;
  /** The ms between two ticks of the loop while it runs (start, until stop); undefined otherwise. */
  beat: number | undefined;
  /** The next tick of the loop; undefined while a tick of the loop runs. */
  timer: ReturnType<typeof setTimeout> | undefined;
  /** Work outside the tick ended while a tick of the loop ran: the next one follows at once (P1-10b). */
  woken: boolean;
  /** The tick in progress: ticks run one after the other, never two at once. */
  queue: Promise<unknown>;
}
