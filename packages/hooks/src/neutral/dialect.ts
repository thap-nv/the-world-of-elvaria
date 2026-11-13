// The neutral hook dialect (implementation-plan §3.6, PS-23): how a CLI's hook payload reads and how its answers are
// written, as data the adapter puts into `policy.json` (`dialect`), so a fourth CLI with hooks gets the tool gate and
// the events without a branch of this package, and the hook never loads code of the owner's. Shaped after the three
// payloads Elvaria reads (Claude Code: the event in the payload, snake_case; agy: the event in argv, the tool under
// `toolCall`; Codex: Claude's shape with tools of its own). runner-core's `HookDialect` is the writer's copy of this
// contract; this file checks it by hand, since the hook may not load zod (§1.4).

/** `ToolKindSchema` of the domain (`agent.tool.tool`), as claude/tools.ts repeats it. */
export const DIALECT_TOOL_KINDS = ['read', 'write', 'bash', 'web', 'search', 'other'] as const;
export type DialectToolKind = (typeof DIALECT_TOOL_KINDS)[number];

/** Tools Elvaria refuses whatever the class: a sub-agent, a question nobody answers, a tool no class has. */
export const DIALECT_REFUSALS = ['subagent', 'ask', 'tool'] as const;

/** One tool of the CLI; every key names a field of the tool's input (a dot path). */
export interface DialectTool {
  readonly kind: DialectToolKind;
  /** Class tools in Claude Code names, any one of which grants it (`Bash`, `Edit`…); absent: every class may. */
  readonly grants?: readonly string[];
  /** The shell line it runs. */
  readonly command?: string;
  /** The files or folders it reads or writes. */
  readonly paths?: readonly string[];
  /** A patch in the `*** Update File: <path>` form (Codex's apply_patch): the files it changes. */
  readonly patch?: string;
  readonly url?: string;
  readonly refuse?: (typeof DIALECT_REFUSALS)[number];
}

/** The four events Elvaria reads; the CLI's own name of each. Only `pre_tool` is required. */
export interface DialectEvents {
  readonly session_start?: string;
  readonly pre_tool: string;
  readonly post_tool?: string;
  readonly stop?: string;
}

/** policy.json `dialect` v1. Every path is a dot path into the payload (`toolCall.args`). */
export interface HookDialect {
  readonly version: 1;
  /** Where the CLI names the event: a dot path, or `argv` for the first argument after the script (agy's way). */
  readonly event: string;
  readonly events: DialectEvents;
  readonly session?: string;
  readonly model?: string;
  /** The session's folder, which a path in `agent.tool` is written relative to. */
  readonly cwd?: string;
  readonly tool_name: string;
  readonly tool_input: string;
  /** A command's exit code in the post-tool payload. */
  readonly exit?: string;
  /** The CLI's tools by name; a name ending in `*` stands for every tool that starts with the rest. */
  readonly tools: Readonly<Record<string, DialectTool>>;
  /** A tool `tools` does not name: refused (the default, as an unreadable call is), or let through as `other`. */
  readonly unknown_tools?: 'deny' | 'allow';
  /**
   * The answers, as JSON whose strings `{reason}` stands in: `deny` refuses a tool call, `stop` asks for one more turn
   * (the handover letter, ADR 0010), `pass` is printed when nothing stops a call (agy wants one); absent: nothing.
   */
  readonly answers: { readonly deny: Answer; readonly stop?: Answer; readonly pass?: Answer };
}

/** One answer: a JSON object, printed as one line. */
export type Answer = Readonly<Record<string, unknown>>;

/** The value `{reason}` marks in an answer. */
export const REASON_MARK = '{reason}';
/** `event: argv`: the event is the first positional argument, as for agy. */
export const EVENT_IN_ARGV = 'argv';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isTexts = (value: unknown): boolean => Array.isArray(value) && value.every(isText);
const optionalText = (value: unknown): boolean => value === undefined || isText(value);

function toolProblem(name: string, tool: unknown): string | undefined {
  if (!isRecord(tool)) return `dialect.tools.${name} is not an object`;
  const kinds: readonly unknown[] = DIALECT_TOOL_KINDS;
  if (!kinds.includes(tool.kind))
    return `dialect.tools.${name}.kind is not one of ${DIALECT_TOOL_KINDS.join(', ')}`;
  const refusals: readonly unknown[] = DIALECT_REFUSALS;
  if (tool.refuse !== undefined && !refusals.includes(tool.refuse))
    return `dialect.tools.${name}.refuse is not one of ${DIALECT_REFUSALS.join(', ')}`;
  const lists = ['grants', 'paths'].find((key) => tool[key] !== undefined && !isTexts(tool[key]));
  if (lists !== undefined) return `dialect.tools.${name}.${lists} is not a list of strings`;
  const texts = ['command', 'patch', 'url'].find((key) => !optionalText(tool[key]));
  return texts === undefined ? undefined : `dialect.tools.${name}.${texts} is not a string`;
}

function answersProblem(answers: unknown): string | undefined {
  if (!isRecord(answers) || !isRecord(answers.deny)) return 'dialect.answers.deny is not an object';
  const other = ['stop', 'pass'].find((key) => answers[key] !== undefined && !isRecord(answers[key]));
  return other === undefined ? undefined : `dialect.answers.${other} is not an object`;
}

/** What is wrong with policy.json's `dialect`, if anything; absent is fine (the CLI is one the hook knows). */
export function dialectProblem(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return 'dialect is not an object';
  if (value.version !== 1) return `dialect.version is ${JSON.stringify(value.version)}, not 1`;
  const required = ['event', 'tool_name', 'tool_input'].find((key) => !isText(value[key]));
  if (required !== undefined) return `dialect.${required} is not a string`;
  const optional = ['session', 'model', 'cwd', 'exit'].find((key) => !optionalText(value[key]));
  if (optional !== undefined) return `dialect.${optional} is not a string`;
  const events = value.events;
  if (!isRecord(events) || !isText(events.pre_tool)) return 'dialect.events.pre_tool is not a string';
  const event = ['session_start', 'post_tool', 'stop'].find((key) => !optionalText(events[key]));
  if (event !== undefined) return `dialect.events.${event} is not a string`;
  if (!isRecord(value.tools)) return 'dialect.tools is not an object';
  for (const [name, tool] of Object.entries(value.tools)) {
    const problem = toolProblem(name, tool);
    if (problem !== undefined) return problem;
  }
  if (![undefined, 'deny', 'allow'].includes(value.unknown_tools as string | undefined))
    return 'dialect.unknown_tools is not deny or allow';
  return answersProblem(value.answers);
}

/** The value at a dot path of the payload. */
export function valueAt(payload: unknown, dotPath: string | undefined): unknown {
  if (dotPath === undefined) return undefined;
  let value = payload;
  for (const key of dotPath.split('.')) value = isRecord(value) ? value[key] : undefined;
  return value;
}

/** A non-empty string at a dot path, else undefined. */
export const textAt = (payload: unknown, dotPath: string | undefined): string | undefined => {
  const value = valueAt(payload, dotPath);
  return isText(value) ? value : undefined;
};

/** The tool `name` is, by its exact name first, then by the longest `<prefix>*` it starts with. */
export function dialectToolOf(dialect: HookDialect, name: string): DialectTool | undefined {
  const exact = dialect.tools[name];
  if (exact !== undefined) return exact;
  const prefixes = Object.keys(dialect.tools)
    .filter((key) => key.endsWith('*') && name.startsWith(key.slice(0, -1)))
    .toSorted((a, b) => b.length - a.length);
  return prefixes[0] === undefined ? undefined : dialect.tools[prefixes[0]];
}

/** An answer of the dialect with `{reason}` replaced in each of its strings. */
export function answerOf(template: Answer, reason: string): Answer {
  const fill = (value: unknown): unknown => {
    if (typeof value === 'string') return value.replaceAll(REASON_MARK, reason);
    if (Array.isArray(value)) return value.map(fill);
    return isRecord(value)
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fill(item)]))
      : value;
  };
  // dialectProblem checked that every answer is an object, and fill keeps an object one.
  return fill(template) as Answer;
}
