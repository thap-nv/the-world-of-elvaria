// Why a class may not use a tool of a CLI that does not enforce the class's tools itself (agy, Codex, a CLI read
// through the neutral dialect; implementation-plan §3.6, P1-10): the hook compares the tools that would grant it,
// in Claude Code names, with the class's (policy `tools`). One gate for every such CLI (PS-23): before it agy and Codex
// each had a copy, and only agy's let a class without a shell ask the code graph (PS-21).
import { graphCommandOf, plainGraphReason } from './graph.ts';
import { plainLineProblem, plainSearchReason, searchCommandOf } from './search.ts';
import type { ToolCall } from './claude/tools.ts';
import type { HookContext } from './context.ts';

/**
 * Why a class lacking the tools of `name` (`missing`) may not use it. A shell line that calls a search command the
 * policy grants for Glob and Grep may run when it is one plain call (P1-53), and so may a code graph command (PS-21):
 * a CLI's prefix rule, or none, cannot see what else the line does.
 */
export function classViolation(
  name: string,
  missing: readonly string[],
  call: ToolCall,
  ctx: HookContext,
): string | undefined {
  const { command } = call;
  if (command !== undefined && searchCommandOf(command, ctx.searchCommands) !== undefined) {
    const problem = plainLineProblem(command);
    return problem === undefined ? undefined : `${name}: ${plainSearchReason(problem, ctx.searchCommands)}`;
  }
  if (command !== undefined && graphCommandOf(command, ctx.graphCommands) !== undefined) {
    const problem = plainLineProblem(command);
    return problem === undefined ? undefined : `${name}: ${plainGraphReason(problem, ctx.graphCommands)}`;
  }
  const searching =
    command === undefined || ctx.searchCommands.length === 0
      ? ''
      : `; to search or read the files git tracks, run ${ctx.searchCommands.join(' or ')} alone`;
  const asking =
    command === undefined || ctx.graphCommands.length === 0
      ? ''
      : `; to ask the code graph, run ${ctx.graphCommands.join(' or ')} alone`;
  return `${name}: your class has no ${missing.join(' or ')}${searching}${asking}; do the work with the tools you have`;
}

/** The class tools that would grant a tool (`granting`), when the class has none of them; undefined when it may. */
export function missingTools(
  granting: readonly string[] | undefined,
  classTools: readonly string[] | undefined,
): readonly string[] | undefined {
  if (classTools === undefined || granting === undefined) return undefined;
  return granting.some((tool) => classTools.includes(tool)) ? undefined : granting;
}
