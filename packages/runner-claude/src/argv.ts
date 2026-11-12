// The command lines of Claude Code 2.1.318 (implementation-plan §3.5, §3.7; spike P1-02). Never `--bare` (it drops
// OAuth), `--worktree` (it leaves a lock), `--dangerously-skip-permissions`, nor `--disable-slash-commands`
// (`/usage` is a slash command, and without the Skill tool the skill list costs no context).
import { sessionTools } from './graph-rules.ts';
import type { SpawnRequest } from '@elvaria/runner-core';

/** Files of the run folder the session reads. */
export interface RunFiles {
  readonly settings: string;
  /** The system part of the prompt, for `--append-system-prompt-file`. */
  readonly system: string;
  /** Present when the character may start the apprentice. */
  readonly agents?: string;
}

/** One line per event, hook events included: the runner and the Steward read them as they come. */
const STREAM = ['--output-format', 'stream-json', '--verbose'] as const;
/**
 * Only the territory (project) and the checkout (local) add settings: the owner's user settings could widen a
 * character's permissions (spike P1-02, "Bổ sung"). `--strict-mcp-config` without `--mcp-config` drops every MCP
 * server, the owner's claude.ai connectors included.
 */
const ISOLATED = ['--setting-sources', 'project,local', '--strict-mcp-config'] as const;

/** `--tools` lists the tools that exist at all; `""` means none (`--tools` help). */
const toolsArg = (tools: readonly string[]): string => tools.join(',');

/**
 * A session. The user part of the prompt goes on stdin, not in argv: a verifier's prompt carries a whole diff,
 * and a Windows command line stops at 32 767 characters ("Input must be provided either through stdin or as a
 * prompt argument when using --print").
 */
export function sessionArgv(req: SpawnRequest, files: RunFiles, sessionId: string): string[] {
  const { budget, permissions, structured, resume } = req;
  return [
    '-p',
    ...STREAM,
    '--include-hook-events',
    '--permission-mode',
    'dontAsk',
    '--settings',
    files.settings,
    '--model',
    req.character.model,
    '--max-turns',
    String(budget.max_turns),
    ...(budget.max_usd === undefined ? [] : ['--max-budget-usd', String(budget.max_usd)]),
    ...(structured === undefined ? [] : ['--json-schema', JSON.stringify(structured)]),
    // --resume keeps the session's id; a new session gets the one the runner chose, known before any output.
    ...(resume === undefined ? ['--session-id', sessionId] : ['--resume', resume.session_id]),
    '--append-system-prompt-file',
    files.system,
    ...(files.agents === undefined ? [] : ['--agents', files.agents]),
    '--tools',
    toolsArg(sessionTools(permissions)),
    ...ISOLATED,
  ];
}

/** Reads the account's limits without calling a model: 0 mana (spike P1-02). */
export const USAGE_PROMPT = '/usage';
export const PING_PROMPT = 'Reply with the single word ok.';

export const usageArgv = (): string[] => ['-p', USAGE_PROMPT, ...STREAM, ...ISOLATED];

/** The cheapest real call: one turn, no tool (§3.5). Only when `/usage` says the window has room. */
export const pingArgv = (model: string): string[] => [
  '-p',
  PING_PROMPT,
  ...STREAM,
  '--model',
  model,
  '--max-turns',
  '1',
  '--tools',
  '',
  ...ISOLATED,
];
