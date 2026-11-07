// Claude Code tool calls in the normalised shape of `agent.tool` (implementation-plan §3.10). The world sees
// the kind of tool, never the CLI's tool names, so the mapping stops here.

/** ToolKindSchema of the domain (`agent.tool.tool`), repeated: the hook may not load the domain (§1.4). */
export type ToolKind = 'read' | 'write' | 'bash' | 'web' | 'search' | 'other';

const KINDS: Readonly<Record<string, ToolKind>> = {
  Read: 'read',
  Glob: 'read',
  Grep: 'read',
  LS: 'read',
  NotebookRead: 'read',
  Edit: 'write',
  Write: 'write',
  MultiEdit: 'write',
  NotebookEdit: 'write',
  Bash: 'bash',
  BashOutput: 'bash',
  KillShell: 'bash',
  // Claude Code's shell tool on Windows when Git Bash is missing.
  PowerShell: 'bash',
  WebFetch: 'web',
  WebSearch: 'web',
};

/** Tools whose `command` input is a shell line. */
const SHELLS = new Set(['Bash', 'PowerShell']);
/** The sub-agent tool: `Agent` in hook payloads, `Task` in `permission_denials` and older versions (spike P1-02). */
const SUBAGENT_TOOLS = new Set(['Agent', 'Task']);
/** `tool_input` keys that name a file or folder the tool reads or writes. */
const PATH_KEYS = ['file_path', 'notebook_path', 'path'] as const;

export interface ToolCall {
  readonly kind: ToolKind;
  /** Files or folders named by the input, as given (native separators, absolute or relative). */
  readonly paths: readonly string[];
  /** Also guarded, not logged: Grep's `glob` filter (`.env`) names files whose content it reads. */
  readonly guarded: readonly string[];
  readonly command: string | undefined;
  readonly url: string | undefined;
  /** For the sub-agent tool, the `subagent_type` asked for (`''` when none); undefined for other tools. */
  readonly subagent: string | undefined;
  /** For the sub-agent tool, the `model` the caller names over the agent's own; undefined when none. */
  readonly model: string | undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const textAt = (input: Record<string, unknown>, key: string): string | undefined => {
  const value = input[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
};

export const toolKindOf = (name: string): ToolKind => KINDS[name] ?? 'other';

export function toolCallOf(name: unknown, rawInput: unknown): ToolCall {
  const tool = typeof name === 'string' ? name : '';
  const input = isRecord(rawInput) ? rawInput : {};
  const paths = PATH_KEYS.flatMap((key) => textAt(input, key) ?? []);
  const glob = tool === 'Grep' ? textAt(input, 'glob') : undefined;
  return {
    kind: toolKindOf(tool),
    paths,
    guarded: glob === undefined ? paths : [...paths, glob],
    command: SHELLS.has(tool) ? textAt(input, 'command') : undefined,
    url: tool === 'WebFetch' ? textAt(input, 'url') : undefined,
    subagent: SUBAGENT_TOOLS.has(tool) ? (textAt(input, 'subagent_type') ?? '') : undefined,
    model: SUBAGENT_TOOLS.has(tool) ? textAt(input, 'model') : undefined,
  };
}

/**
 * A path for `agent.tool.path`: relative to the plot (the session's cwd) with `/` separators, as the event
 * contract asks; a path outside the plot stays absolute, with `/`. Drive letters and case are compared
 * loosely, because Windows paths arrive as `C:\…` or `c:/…`.
 */
export function plotPath(raw: string, cwd: string | undefined): string {
  // A trailing separator goes (a root such as `/` keeps its own), so the plot itself reads `.`.
  const portable = raw.replaceAll('\\', '/').replace(/(?<=.)\/+$/, '');
  if (cwd === undefined || cwd === '') return portable;
  const root = cwd.replaceAll('\\', '/').replace(/\/+$/, '');
  if (portable.toLowerCase() === root.toLowerCase()) return '.';
  const prefix = `${root}/`;
  return portable.toLowerCase().startsWith(prefix.toLowerCase()) ? portable.slice(prefix.length) : portable;
}
