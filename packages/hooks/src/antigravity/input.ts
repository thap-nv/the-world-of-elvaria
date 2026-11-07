// An Antigravity CLI (`agy`) hook payload: stdin JSON in camelCase, read defensively (spike P1-12a §4). The
// payload names no event, so the hook command carries it in argv (`node elvaria-hook.mjs PreToolUse`, written by
// the runner into `.agents/hooks.json`); a positional argument is what tells an agy call from a Claude one.

export interface AgyInput {
  readonly raw: Readonly<Record<string, unknown>>;
  /** From argv: `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop` (the four the runner declares). */
  readonly event: string;
  /** `conversationId`; a sub-agent has its own. */
  readonly session: string | undefined;
  /** `modelName`, the full slug (`gemini-3.8-flash-low`). */
  readonly model: string | undefined;
  /** `workspacePaths[0]`, the plot, with `/` separators. */
  readonly workspace: string | undefined;
  /** A sub-agent's session: its `lastUserInput` is empty, the only mark the payload has (spike §6). */
  readonly subagent: boolean;
  /** `toolCall.name` and `toolCall.args` of PreToolUse and PostToolUse. */
  readonly toolName: unknown;
  readonly toolArgs: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const textOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** The value-taking flags of the hook's argv: the shim appends `--policy <run_dir>/policy.json`. */
const VALUE_FLAGS = new Set(['--policy']);

/** The event of an agy call: the first argument that is neither a flag nor a flag's value; undefined for Claude. */
export function argvEvent(argv: readonly string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (VALUE_FLAGS.has(arg)) index += 1;
    else if (!arg.startsWith('-') && arg !== '') return arg;
  }
  return undefined;
}

export function agyInputOf(raw: Readonly<Record<string, unknown>>, event: string): AgyInput {
  const call = isRecord(raw.toolCall) ? raw.toolCall : {};
  const workspaces = Array.isArray(raw.workspacePaths) ? (raw.workspacePaths as unknown[]) : [];
  return {
    raw,
    event,
    session: textOf(raw.conversationId),
    model: textOf(raw.modelName),
    workspace: textOf(workspaces[0]),
    // Only a string that is present and empty marks a sub-agent: a missing field says nothing.
    subagent: raw.lastUserInput === '',
    toolName: call.name,
    toolArgs: call.args,
  };
}
