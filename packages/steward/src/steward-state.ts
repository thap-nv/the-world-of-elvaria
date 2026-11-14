// What a Steward holds while it runs and keeps between ticks (implementation-plan §3.1). Apart from steward.ts, which
// creates it, since PS-03: the tick (tick.ts) and the loop (loop.ts) work on it too.
import type { JudgeWait, QuestId, TribeId, TribeLimits, ZonedTime } from '@elvaria/domain';
import type { PromptTemplates } from '@elvaria/runner-core';
import type { HeldLock } from '@elvaria/store';

import type { Background } from './background.ts';
import type { GraphBuilds } from './graph-builds.ts';
import type { JudgeLocks } from './review/exclusive.ts';
import type { PromptSizes } from './review/prompt-size.ts';
import type { ManaBook } from './mana/book.ts';
import type { Restart } from './restart.ts';
import type { Scheduler } from './schedule/scheduler.ts';
import type { Sessions } from './sessions/running.ts';
import type { VersionBook } from './tribe-versions.ts';
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
  /** Code graphs building outside the tick (PS-21): stop() kills them; undefined without `deps.graphs`. */
  readonly graphs: GraphBuilds | undefined;
  reported: Reported;
  /** Aborted by stop(): a tick it stops in starts no other script. */
  stopping: AbortController;
  /** Submitted quests the bell already named for having no judge in the roster (unjudgeable.ts, P1-15). */
  readonly unjudged: Set<QuestId>;
  /** Submitted quests the bell named for judges all held by their mana, with their gauges (judge-waits.ts, PS-03). */
  readonly judgeWaits: Map<QuestId, JudgeWait>;
  /** The judges' prompts measured for the reviews about to be judged (review/prompt-size.ts). */
  readonly promptSizes: PromptSizes;
  /** What the tribes' CLIs said their version was, and the tribes held by it (tribe-versions.ts, A1b). */
  readonly versions: VersionBook;
  /** The scheduled jobs: the digest, and the jobs the composition root gives (PS-03). */
  readonly scheduler: Scheduler;
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
