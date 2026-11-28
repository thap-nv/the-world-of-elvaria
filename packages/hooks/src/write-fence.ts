// The write fence of a read-only quest (P2-01d, 383a, W7): an inquiry device asked a question, so the session writes
// its report (policy `writable_paths`, globs from the root of the plot) and the quest's handover letter, nothing else.
// One rule for every dialect, after the dialect's own rules (refusalOf): Claude Code and agy have no permission rule
// that says "only this file", and Codex's sandbox lets the session write its whole plot. A write the hook cannot place
// (no path named, another spelling of the plot) is refused, as the laws err on the side of blocking.
import path from 'node:path';
import process from 'node:process';

import { handoverPath } from './handover.ts';
import { shellWriteTargets } from './laws.ts';
import type { ToolCall } from './claude/tools.ts';
import type { HookContext } from './context.ts';
import type { CompiledPaths } from './laws.ts';

/** The path of `file` from `root` with `/`, or undefined when it lies outside it. */
function insideOf(root: string, file: string): string | undefined {
  const relative = path.relative(root, file);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return undefined;
  return relative.replaceAll('\\', '/');
}

/** Whether `raw` names the quest's letter or a writable path of the plot. */
function writable(
  raw: string,
  root: string,
  ctx: Pick<HookContext, 'kingdom' | 'quest'>,
  paths: CompiledPaths,
) {
  const file = path.resolve(root, raw);
  const { kingdom, quest } = ctx;
  if (
    kingdom !== undefined &&
    quest !== undefined &&
    path.relative(handoverPath(kingdom, quest), file) === ''
  )
    return true;
  const relative = insideOf(root, file);
  return relative !== undefined && paths.some(({ regex }) => regex.test(relative));
}

const reasonOf = (raw: string, paths: CompiledPaths): string =>
  `${raw} is not yours to write: this quest only asks a question, so it changes no file of the territory; write your findings to ${paths.map(({ glob }) => glob).join(', ')} at the root of your plot, and your handover letter`;

/**
 * Why `call` breaks a read-only quest's write fence, if it does: a write tool on another path, or one naming none,
 * and a shell line that writes a file itself (a search command's redirection). `cwd` is the session's folder as the
 * payload names it; without one, the hook's own, where the CLI runs it.
 */
export function writeFenceViolation(
  call: ToolCall,
  cwd: string | undefined,
  ctx: Pick<HookContext, 'kingdom' | 'quest' | 'writable'>,
): string | undefined {
  const paths = ctx.writable;
  if (paths === undefined) return undefined;
  if (call.kind === 'write') {
    if (call.guarded.length === 0) return reasonOf('a write that names no file', paths);
    const root = path.resolve(cwd ?? process.cwd());
    const refused = call.guarded.find((raw) => !writable(raw, root, ctx, paths));
    // Named from the plot's root when it lies there: the model reads the path it would write, not the CLI's spelling.
    if (refused !== undefined) return reasonOf(insideOf(root, path.resolve(root, refused)) ?? refused, paths);
  }
  const target = call.command === undefined ? undefined : shellWriteTargets(call.command)[0];
  return target === undefined ? undefined : reasonOf(target, paths);
}
