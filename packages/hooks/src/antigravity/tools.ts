// agy tool calls in the normalised shape of `agent.tool` (implementation-plan §3.10). Tool names and argument
// keys come from spike P1-12a (`run_command` CommandLine, `read_file`/`write_file` Path), the tool list of agy
// 1.5.2's `init` line, and the tools a model reported under `-p` in P1-12b (`edit_file`, `ask_question`, no URL
// fetch); arguments are PascalCase and paths carry backslashes on Windows.
import type { ToolCall, ToolKind } from '../claude/tools.ts';

const KINDS: Readonly<Record<string, ToolKind>> = {
  read_file: 'read',
  view_file: 'read',
  list_dir: 'read',
  grep_search: 'read',
  find_by_name: 'read',
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
  };
}
