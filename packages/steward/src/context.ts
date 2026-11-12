// What every step of one tick works with: the deps, the world as the tick sees it, the pen, the sessions.
import type { Background } from './background.ts';
import type { GraphBuilds } from './graph-builds.ts';
import type { JudgeLocks } from './review/exclusive.ts';
import type { Notice, NoticeQuest, StewardDeps } from './types.ts';
import type { ManaBook } from './mana/book.ts';
import type { Recorder } from './record.ts';
import type { Sessions } from './sessions/running.ts';
import type { World } from './world.ts';
import type { TribeId, TribeLimits } from '@elvaria/domain';
import type { PromptTemplates } from '@elvaria/runner-core';

export interface Counts {
  applied: number;
  rejected: number;
  waiting: number;
  started: number;
  ended: number;
}

export interface Context {
  readonly deps: StewardDeps;
  /** Absolute path of the kingdom folder. */
  readonly root: string;
  readonly world: World;
  readonly record: Recorder;
  readonly sessions: Sessions;
  readonly templates: PromptTemplates;
  readonly limits: Partial<Record<TribeId, TribeLimits>>;
  /** Readings, sleeping pools and probe times, kept between ticks (§3.5). */
  readonly mana: ManaBook;
  readonly counts: Counts;
  /** Aborted when the Steward stops: no new script starts in a tick it stops in (§3.12). */
  readonly stopping: AbortSignal;
  /** The checks and scripts running outside the tick (P1-25). */
  readonly background: Background;
  /** The exclusive locks the judges in their scratch plots hold, across ticks (P1-20). */
  readonly judgeLocks: JudgeLocks;
  /** The code graphs built outside the tick (PS-21); absent without `deps.graphs`: no quest gets a graph. */
  readonly graphs?: GraphBuilds | undefined;
}

/** Rings the bell; a bell that fails never stops a tick. */
export async function ring(ctx: Context, notice: Notice): Promise<void> {
  try {
    await ctx.deps.bell.ring(notice);
  } catch (error) {
    ctx.deps.log.warn(`steward: the bell failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const noticeQuest = ({ id, title, rank }: NoticeQuest): NoticeQuest => ({ id, title, rank });
