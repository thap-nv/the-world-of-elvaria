// The one interface between the Steward and an agent CLI (implementation-plan §3.7, ADR 0006, 0021). The Steward
// sees AgentRunner and its capabilities, never a CLI name; an adapter translates a SpawnRequest into argv, env and
// settings of its CLI, and the CLI's output into RunnerSignal and RunResult.
import type {
  AdapterCapabilities,
  Character,
  Quest,
  ReportedWindow,
  Territory,
  TribeId,
} from '@elvaria/domain';

import type { ToolPolicy } from '../policy/tool-policy.ts';
import type { SpawnRole } from './roles.ts';

/**
 * `kingdom.tribes[].adapter`: a built-in adapter (`claude_code`, `antigravity`, `gemini_cli`, `codex_cli`), an owner
 * file `adapters/<name>.mjs`, or `fake` for FakeRunner.
 */
export type AdapterId = string;
/** An absolute path in the native form of the machine (the data files use `/`, §2.1). */
export type AbsolutePath = string;
export type JsonSchema = Readonly<Record<string, unknown>>;

/** What a session receives: the system part goes where the CLI keeps instructions, the user part is `-p`. */
export interface BuiltPrompt {
  /** Royal decree (if any), then the role's instructions (§3.7). */
  readonly system: string;
  readonly user: string;
}

/** Limits the CLI enforces itself; the breakers outside it (minutes, tokens over time) are the Steward's (§3.4). */
export interface Budget {
  readonly max_turns: number;
  readonly max_minutes: number;
  /** Claude `--max-budget-usd`, for a tribe on a paid key. */
  readonly max_usd?: number;
}

export interface SpawnRequest {
  readonly role: SpawnRole;
  readonly quest?: Quest;
  readonly character: Character;
  readonly territory?: Territory;
  /** The plot (worktree) of an assignee or verifier; the run folder for a role without one. */
  readonly cwd: AbsolutePath;
  readonly prompt: BuiltPrompt;
  readonly permissions: ToolPolicy;
  readonly budget: Budget;
  /** Continue this CLI session (`--resume`): only for resume_after_mana or an answer in time (ADR 0017). */
  readonly resume?: { readonly session_id: string };
  /** JSON Schema of the structured output (Chancellor, verifier). */
  readonly structured?: JsonSchema;
  /** The whole env of the child: the minimal list, `ELVARIA_*` and allowed secrets (§3.9); never process.env. */
  readonly env: Readonly<Record<string, string>>;
  /** `<kingdom>/.runs/<quest>-<n>/`: generated settings, policy.json, stdout and stderr of this run (§2.2). */
  readonly run_dir: AbsolutePath;
  /** `quests/<id>/handover.md` of an assignee: its Question section becomes RunResult.question (§2.4). */
  readonly handover?: AbsolutePath;
}

/** What a session reports while it runs (§3.10); the hook writes the events, these are for the Steward. */
export type RunnerSignal =
  /** Tokens so far, as `countedTokens` counts them (cache reads at a tenth, P1-23); never goes down. */
  | { readonly kind: 'usage'; readonly tokens: number }
  | { readonly kind: 'rate_limit'; readonly detail: string; readonly resets_at?: string }
  /** The account's windows as the CLI reports them in band (Claude `rate_limit_event`), for the mana gauge (§3.5). */
  | { readonly kind: 'mana'; readonly windows: readonly ReportedWindow[] }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'tool_blocked'; readonly tool: string; readonly reason: string };

/** `agent.session.end.outcome` uses the same words (domain event-data). */
export const RUN_OUTCOMES = ['completed', 'max_turns', 'budget', 'killed', 'error'] as const;
export type RunOutcome = (typeof RUN_OUTCOMES)[number];

/** A tool call the CLI or the hook refused (Claude `permission_denials`, Antigravity `denied_actions`). */
export interface PermissionDenial {
  readonly tool: string;
  /** The command, path or input that was refused. */
  readonly detail: string;
}

export interface RunResult {
  readonly outcome: RunOutcome;
  /** null when the process ended on a signal or was killed before it reported one. */
  readonly exit_code: number | null;
  /** `tokens` as `countedTokens` counts them, the unit of quest.budget.max_tokens and attempt_log[].tokens. */
  readonly usage: { readonly tokens: number; readonly turns?: number };
  readonly structured?: unknown;
  readonly session_id: string;
  readonly duration_ms: number;
  readonly permission_denials: readonly PermissionDenial[];
  /** The session hit a usage limit (429, quota): the Steward pauses for mana instead of the infirmary. */
  readonly rate_limited: boolean;
  /** The Question section of the handover letter: the Steward moves the quest `ask` → `blocked` (§2.4). */
  readonly question?: string;
  /**
   * The sessions that followed the first in the same run (spawnSequel, §3.14, P1-33), in order: a reply tried once
   * more, a reminder of the letter. `session_id` above stays the first one's; the tokens are of them all.
   */
  readonly sequels?: readonly SequelSession[];
}

/** A session that followed the first in a run, and why it was opened. */
export interface SequelSession {
  readonly session_id: string;
  readonly why: string;
}

export interface RunningSession {
  readonly session_id: Promise<string>;
  /** OS process id of the CLI; 0 for an in-process runner (FakeRunner). */
  readonly pid: number;
  /** One reader; ends when the session ends. */
  readonly signals: AsyncIterable<RunnerSignal>;
  wait(): Promise<RunResult>;
  /** Ends the session and its process tree; the result's outcome is `killed`. A no-op once it has ended. */
  kill(reason: string): Promise<void>;
}

/** A cheap call that tells whether the account answers (§3.5); real probes cost no or almost no mana. */
export interface ProbeResult {
  readonly status: 'ok' | 'rate_limited' | 'error';
  readonly detail?: string;
  readonly resets_at?: string;
  /** The account's windows the probe read on the way (`/usage`), for the mana gauge; absent when it read none. */
  readonly windows?: readonly ReportedWindow[];
}

export interface ProbeOptions {
  /**
   * false: only read the account's windows, never call a model (0 mana): how the Steward watches an awake pool.
   * The status then says what the windows say. Default true: prove a call goes through (waking a pool).
   */
  readonly ping?: boolean;
}

/** `elvaria doctor`: the CLI found, its version, and whether its login works. */
export interface ToolInfo {
  readonly path: AbsolutePath;
  readonly version: string;
  readonly auth_ok: boolean;
  readonly detail?: string;
}

export interface AgentRunner {
  readonly tribe: TribeId;
  readonly adapter: AdapterId;
  readonly capabilities: AdapterCapabilities;
  spawn(req: SpawnRequest): Promise<RunningSession>;
  probe(options?: ProbeOptions): Promise<ProbeResult>;
  doctor(): Promise<ToolInfo>;
}
