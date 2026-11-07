// What the Steward is given and what it gives back (implementation-plan §3.1). It sees only AgentRunner and its
// capabilities, never a CLI (ADR 0006, 0021): apps/cli, the composition root, injects the runners of the tribes.
import type { Clock, IdSource, Quest, QuestId, Rank, Territory, TribeId } from '@elvaria/domain';
import type { EventLog } from '@elvaria/eventlog';
import type { AgentRunner, PromptTemplates } from '@elvaria/runner-core';
import type { KingdomStore } from '@elvaria/store';

/** A quest as a notice names it: enough for the owner to recognise it without opening the file. */
export interface NoticeQuest {
  readonly id: QuestId;
  readonly title: string;
  readonly rank: Rank;
}

/**
 * What rings the bell (§3.1, §6). Data, not text: the bell of the composition root says it in the owner's
 * language (ConsoleBell in stage 1; desktop and web push in stage 2).
 */
export type Notice =
  | {
      readonly kind: 'unclaimable';
      readonly quest: NoticeQuest;
      readonly reason: 'no_class' | 'level_too_low';
      readonly class: string;
      readonly best?: { readonly character: string; readonly level: number; readonly ceiling: Rank };
    }
  | { readonly kind: 'awaiting_seal'; readonly quest: NoticeQuest }
  | { readonly kind: 'infirmary'; readonly quest: NoticeQuest; readonly reason: string }
  | { readonly kind: 'question'; readonly quest: NoticeQuest; readonly question: string };

export interface Bell {
  ring(notice: Notice): Promise<void>;
}

/** Problems nobody is waiting for an answer to: a refused move, a failed spawn, a lost lock. English, for logs. */
export interface Logger {
  warn(message: string): void;
}

/** The quest's own ground, prepared for a session (§3.3): what the quest records, and where the session runs. */
export interface PreparedPlot {
  readonly plot: Quest['plot'];
  /** Native absolute path: the session's cwd. */
  readonly cwd: string;
}

/** PlotManager.prepare of P1-07 fits here; until it is wired, folderPlots gives every quest a folder. */
export interface Plots {
  /** Idempotent: a quest that already has its plot gets the same one back. */
  prepare(quest: Quest, territory: Territory): Promise<PreparedPlot>;
}

export interface StewardDeps {
  readonly store: KingdomStore;
  readonly events: EventLog;
  /** One runner per tribe that may work; a tribe without one takes no quest. */
  readonly runners: Readonly<Partial<Record<TribeId, AgentRunner>>>;
  readonly plots: Plots;
  readonly clock: Clock;
  readonly ids: IdSource;
  readonly bell: Bell;
  readonly log: Logger;
  /** Prompt templates of runner-core; loaded from its prompts/ folder at start when not given. */
  readonly templates?: PromptTemplates;
}

export interface TickReport {
  /** Inbox commands applied, rejected, and left for a later tick (an answer whose asker is busy). */
  readonly commands: { readonly applied: number; readonly rejected: number; readonly waiting: number };
  /** Sessions opened, and sessions whose end the tick recorded. */
  readonly sessions: { readonly started: number; readonly ended: number };
}

export type StartError = 'locked' | 'no_kingdom';

export interface Steward {
  /** Takes `.state/steward.lock`, rebuilds what the log knows, and ticks every dispatch.tick_seconds unless `loop` is false. */
  start(options?: {
    readonly loop?: boolean;
  }): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: StartError }>;
  /** Stops ticking, kills the sessions it runs (the next start finds their quests and retries them), releases the lock. */
  stop(): Promise<void>;
  /** One tick (§3.1); ticks never overlap. */
  tick(): Promise<TickReport>;
  /** Sessions still running: what a test waits on. */
  running(): number;
}
