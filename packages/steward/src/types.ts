// What the Steward is given and what it gives back (implementation-plan §3.1). It sees only AgentRunner and its
// capabilities, never a CLI (ADR 0006, 0021): apps/cli, the composition root, injects the runners of the tribes.
import type { Clock, IdSource, ToolFound, TribeId, UpgradeOffer } from '@elvaria/domain';
import type { EventLog } from '@elvaria/eventlog';
import type { AgentRunner, CodeGraphs, PromptTemplates, Treasury } from '@elvaria/runner-core';
import type { KingdomStore } from '@elvaria/store';

import type { Forges } from './forge/forge.ts';
import type { Bell } from './bell/notice.ts';
import type { Plots } from './plot/plot.ts';
import type { Digest, OnCallJob, ScheduledJob } from './schedule/ports.ts';
import type { ScriptRunner } from './script/run-script.ts';

export type { Bell, ManaGaugeNotice, Notice, NoticeQuest } from './bell/notice.ts';
// The quest's ground (PreparedPlot, ResolvedCheck, Plots; PlotCheck and PlotTrial, what a Plots call takes) lives in
// plot-types.ts.
export type { Plots, PreparedPlot, ResolvedCheck } from './plot/plot.ts';
export type {
  Digest,
  DigestRequest,
  JobMode,
  JobRun,
  JobView,
  OnCallJob,
  ScheduledJob,
  TempleView,
} from './schedule/ports.ts';

/** Problems nobody is waiting for an answer to: a refused move, a failed spawn, a lost lock. English, for logs. */
export interface Logger {
  warn(message: string): void;
}

export interface StewardDeps {
  readonly store: KingdomStore;
  readonly events: EventLog;
  /** One runner per tribe that may work; a tribe without one takes no quest. */
  readonly runners: Readonly<Partial<Record<TribeId, AgentRunner>>>;
  readonly plots: Plots;
  /**
   * The minimal env every session starts from (runner-core's `minimalEnv` of the composition root's own env,
   * §3.9); a session adds `ELVARIA_*` and the secrets of its quest. Never process.env whole (ADR 0013).
   */
  readonly env: Readonly<Record<string, string>>;
  /** Where the secrets a quest asks for come from: the file `kingdom.paths.treasury` in stage 1 (ADR 0013). */
  readonly treasury: Treasury;
  readonly clock: Clock;
  readonly ids: IdSource;
  readonly bell: Bell;
  readonly log: Logger;
  /** Prompt templates of runner-core; loaded from its prompts/ folder at start when not given. */
  readonly templates?: PromptTemplates;
  /**
   * How a catalog script runs (§3.12): `nodeScriptRunner(<node>)`, the `node` that runs Elvaria by default. apps/cli
   * names the node it found; a spec may give a runner with a shorter timeout.
   */
  readonly scripts?: ScriptRunner;
  /**
   * The code graphs (PS-21, ADR 0029): runner-core's `codeGraphsOf` with the graphify `doctor --pin` found. Absent:
   * no territory gets a graph, whatever its `code_graph` says, and every quest runs as before.
   */
  readonly graphs?: CodeGraphs;
  /**
   * process.platform by default: which of the shells a tribe's adapter declares (`capabilities.shell`) its sessions'
   * prompts name (shellOf, P1-40). A spec names the OS whose prompt it checks.
   */
  readonly platform?: string;
  /**
   * The digest's port (PS-03): apps/cli words it in the owner's language and writes `digest/<day>.md`. Absent: no
   * digest is written (a spec's Steward).
   */
  readonly digest?: Digest;
  /** More jobs of kingdom.schedule, run by the Steward's scheduler (PS-03b's triage, PS-21c's docs graph). */
  readonly jobs?: readonly ScheduledJob[];
  /** Jobs with no hour, run outside the tick whenever they have work (PS-22b: an amendment's author). */
  readonly onCall?: readonly OnCallJob[];
  /**
   * The CLI the tribe's runner starts and what it says its version is now (`<cli> --version`: no model call, no mana),
   * `version` undefined when the file is gone; undefined when the CLI did not answer. Asked before the plan
   * (tribe-versions.ts, A1b of the lessons of 2026-11-13): a tribe whose CLI is gone or says another version than its
   * checked one opens no new session. Absent: no tribe is held (a spec's Steward).
   */
  readonly toolFound?: (tribe: TribeId) => Promise<ToolFound | undefined>;
  /**
   * The forges a done quest's branch is delivered to (PS-08c, ADR 0023), by territory.delivery.forge, and git as a
   * delivery runs it; `apps/cli/src/run` gives them. Absent: a territory whose delivery is not manual gets one
   * `delivery.failed` (`forge_error`) per quest, and nothing is pushed.
   */
  readonly forges?: Forges;
  /**
   * (PS-08d) A newer build of Elvaria than the one the kingdom pins, read as the digest is made: apps/cli keeps the pin
   * (.state/build.json) and asks the repo it came from. Absent, or undefined: no `upgrade_available` item.
   */
  readonly upgradeOffer?: () => Promise<UpgradeOffer | undefined>;
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
  /**
   * Resolves once the checks and scripts running outside the tick now have ended (P1-25), the graph builds and the
   * scheduled job outside the tick too (PS-03): what a test waits on before the tick that reads them.
   */
  idle(): Promise<void>;
}
