// agy tool calls in the normalised shape of `agent.tool` (implementation-plan §3.10). Tool names and argument
// keys come from spike P1-12a (`run_command` CommandLine, `read_file`/`write_file` Path), the tool list of agy
// 1.5.2's `init` line, and the tools a model reported under `-p` in P1-12b (`edit_file`, `ask_question`, no URL
// fetch); arguments are PascalCase and paths carry backslashes on Windows.
import type { ToolCall, ToolKind } from '../claude/tools.ts';

// Searching and listing are `search`, as Claude's Glob, Grep and LS (PS-21): the metrics count reads by file.
const KINDS: Readonly<Record<string, ToolKind>> = {
  read_file: 'read',
  view_file: 'read',
  list_dir: 'search',
  grep_search: 'search',
  find_by_name: 'search',
  write_file: 'write',
  edit_file: 'write',
  write_to_file: 'write',
  replace_file_content: 'write',
  multi_replace_file_content: 'write',
  sed_file: 'write',
  notebook_edit: 'write',
  run_command: 'bash',
  send_command_input: 'bash',
  command_status: 'bash',
  read_url_content: 'web',
  search_web: 'web',
  open_browser_url: 'web',
};

/**
 * Tools that start another agent. agy caps none of them and cannot stop one from a hook, and their tokens are
 * missing from the parent's usage (spike §6), so stage 1 denies them all (ADR 0017).
 */
export const AGY_SUBAGENT_TOOLS: readonly string[] = [
  'invoke_subagent',
  'define_subagent',
  'browser_subagent',
];

/** Any one of the writing tools of a class grants every agy write tool, as the settings translate them (§3.7). */
const WRITE = ['Edit', 'Write'];

/**
 * The tools of a class (Claude Code names, `ToolPolicy.tools`) that grant each agy tool. agy has no `--tools`, and
 * some of its tools need no permission at all (`search_web`, reading inside the plot; P1-12b), so the hook checks
 * the class (P1-10). A tool not listed (`finish` of `--json-schema`, one a newer agy adds) is left to the settings:
 * blocking an unknown tool blindly would break structured output (spike P1-12a §1 #5).
 */
export const AGY_CLASS_TOOLS: Readonly<Record<string, readonly string[]>> = {
  read_file: ['Read'],
  view_file: ['Read'],
  list_dir: ['Read', 'Glob'],
  grep_search: ['Grep'],
  find_by_name: ['Glob'],
  write_file: WRITE,
  edit_file: WRITE,
  write_to_file: WRITE,
  replace_file_content: WRITE,
  multi_replace_file_content: WRITE,
  sed_file: WRITE,
  notebook_edit: ['NotebookEdit'],
  run_command: ['Bash'],
  send_command_input: ['Bash'],
  command_status: ['Bash'],
  read_url_content: ['WebFetch'],
  open_browser_url: ['WebFetch'],
  search_web: ['WebSearch'],
};

/** The class tools that would grant `name`, when the class has none of them; undefined when it may use it. */
export function missingClassTools(
  name: string,
  classTools: readonly string[] | undefined,
): readonly string[] | undefined {
  const granting = AGY_CLASS_TOOLS[name];
  if (classTools === undefined || granting === undefined) return undefined;
  return granting.some((tool) => classTools.includes(tool)) ? undefined : granting;
}

/**
 * Tools that wait for a person. Nobody answers under `-p`: a question goes in the handover letter and the
 * session ends (law 6 of the assignee prompt, implementation-plan §2.4).
 */
export const AGY_ASK_TOOLS: readonly string[] = ['ask_question', 'ask_permission', 'ask_custom_permission'];

/**
 * Argument keys that name a file or folder: `Path`, `AbsolutePath`, `TargetFile`, `DirectoryPath`, `SearchPath`…
 * Matched by shape rather than listed, so a tool the spike did not meet is still guarded.
 */
const PATH_KEY = /path|file|dir/i;
const URL_KEY = /^url$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const textsOf = (value: unknown): string[] => {
  if (typeof value === 'string') return value === '' ? [] : [value];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item !== '')
    : [];
};

export const agyToolKindOf = (name: string): ToolKind => KINDS[name] ?? 'other';

export function agyToolCallOf(name: unknown, rawArgs: unknown): ToolCall {
  const tool = typeof name === 'string' ? name : '';
  const args = isRecord(rawArgs) ? rawArgs : {};
  const entries = Object.entries(args);
  const paths = entries.filter(([key]) => PATH_KEY.test(key)).flatMap(([, value]) => textsOf(value));
  const url = entries.find(([key]) => URL_KEY.test(key))?.[1];
  const command = tool === 'run_command' ? textsOf(args.CommandLine)[0] : undefined;
  return {
    kind: agyToolKindOf(tool),
    paths,
    guarded: paths,
    command,
    url: typeof url === 'string' && url !== '' ? url : undefined,
    subagent: AGY_SUBAGENT_TOOLS.includes(tool) ? tool : undefined,
    // Antigravity's sub-agents are refused outright (§3.12): no model of theirs is ever weighed.
    model: undefined,
  };
}
