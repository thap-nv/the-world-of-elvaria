// The code graph's commands in the hook (PS-21, ADR 0029). runner-core grants `graphify query`, `path`, `explain` and
// `affected` (policy `graph_commands`) when the quest's graph is built, and the session's GRAPHIFY_OUT names that
// graph. A CLI's prefix rule matches `graphify query --graph <other>` too, and a class with a broad shell rule could
// run `graphify update` (which writes a graph into the plot) or `graphify label` (which calls a model), so the hook,
// which sees the whole line, refuses every graphify call but the granted ones with the options that only shape the
// answer, for every class; a class without a shell runs them as one plain call per line.
import { plainLineProblem, searchCommandOf } from './search.ts';
import type { ToolCall } from './claude/tools.ts';
import type { HookContext } from './context.ts';

const GRAPHIFY_WORD = /^(?:.*[\\/])?graphify(?:\.exe)?$/i;
/**
 * The options of each command that only shape the answer (graphify 0.9.106 `--help`); `--graph` and every other one
 * are refused: the graph is the session's, and a new option is not trusted before it is read.
 */
const SHAPING: Readonly<Record<string, readonly string[]>> = {
  query: ['dfs', 'no-doc-demotion', 'context', 'seed', 'budget', 'depth'],
  path: ['directed', 'undirected'],
  explain: ['all'],
  affected: ['relation', 'depth'],
};
/** Claude Code's shell tools, in the class's tools (policy `tools`). */
const SHELL_TOOLS = ['Bash', 'PowerShell'];

/** The words of each command of a line, quotes dropped: `;`, `|`, `&` and line breaks end a command. */
const commandsOf = (line: string): string[][] =>
  line.split(/[;|&\r\n]+/).map((part) =>
    part
      .replace(/["'`]/g, '')
      .split(/[\s<>(){},]+/)
      .filter((word) => word !== ''),
  );

/** The option `word` names, if it is one: `--budget=4000` names `budget`; a backslash bash would drop is dropped. */
const optionOf = (word: string): string | undefined => {
  const plain = word.replaceAll('\\', '');
  if (!plain.startsWith('-')) return undefined;
  return plain.replace(/^-+/, '').split('=')[0] ?? '';
};

/** Why one command's `words` (from a graphify word on) may not run, if they may not. */
function callViolation(words: readonly string[], granted: readonly string[]): string | undefined {
  if (granted.length === 0) return 'graphify is refused: this quest has no code graph';
  const sub = words[1] ?? '';
  if (!granted.includes(`graphify ${sub}`)) {
    return `graphify ${sub === '' ? 'without a command' : sub} is refused: only ${granted.join(', ')} read your quest's graph, and nothing may build, write or label a graph`;
  }
  const shaping = SHAPING[sub] ?? [];
  const refused = words.slice(2).find((word) => {
    const option = optionOf(word);
    return option !== undefined && !shaping.includes(option);
  });
  return refused === undefined
    ? undefined
    : `graphify ${sub} ${refused} is refused: it takes only ${shaping.map((name) => `--${name}`).join(', ') || 'no option'}; your session's graph is the only one it reads, and a word of a question that starts with - reads as an option, so word it otherwise`;
}

/** Why `command` calls graphify in a way the quest's graph does not allow, if it does (every class, both CLIs). */
export function graphLineViolation(command: string, granted: readonly string[]): string | undefined {
  for (const words of commandsOf(command)) {
    const start = words.findIndex((word) => GRAPHIFY_WORD.test(word));
    if (start === -1) continue;
    const reason = callViolation(words.slice(start), granted);
    if (reason !== undefined) return reason;
  }
  return undefined;
}

/** The graph command `command` starts with, as a prefix rule reads it; undefined for any other line. */
export const graphCommandOf = (command: string, granted: readonly string[]): string | undefined =>
  searchCommandOf(command, granted);

/** Why a class without a shell may not run a graph line that has `problem` (plainLineProblem). */
export const plainGraphReason = (problem: string, granted: readonly string[]): string =>
  `your class has no shell, only ${granted.join(', ')}, each alone on its line with its question and names in single quotes; this line has ${problem}`;

/**
 * A Claude class without a shell gets the shell tool only for the graph's commands (runner-claude, PS-21): any other
 * line, or a graph line that is more than one plain call, is refused. A class with a shell, a call that runs no
 * command, and a CLI that enforces the class's tools itself (no policy `tools`) are left alone.
 */
export function shelllessViolation(call: ToolCall, ctx: HookContext): string | undefined {
  const { command } = call;
  const tools = ctx.tools;
  if (command === undefined || tools === undefined || SHELL_TOOLS.some((tool) => tools.includes(tool))) {
    return undefined;
  }
  if (graphCommandOf(command, ctx.graphCommands) === undefined) {
    return `your class has no shell; it may run only ${ctx.graphCommands.join(', ') || 'no command'}, each alone on its line`;
  }
  const problem = plainLineProblem(command);
  return problem === undefined ? undefined : plainGraphReason(problem, ctx.graphCommands);
}
