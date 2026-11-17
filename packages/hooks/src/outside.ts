// The fence on reads outside the plot (PS-11b, owner's (Q3) after the vision spike of 2026-11-17): a read tool of any
// tribe opens, outside the session's plot, only the screens of its review (policy `images`) and the quest's handover
// letter. Claude Code and agy have their rules first (one rule a file); Codex's `view_image` reads any file on the
// disk whatever its read-only sandbox, so for it this is the only fence. A path the hook cannot tell inside the plot
// (another spelling of the same file) is refused, as the laws err on the side of blocking.
import path from 'node:path';
import process from 'node:process';

import { handoverPath } from './handover.ts';
import type { ToolCall } from './claude/tools.ts';
import type { HookContext } from './context.ts';

const within = (root: string, file: string): boolean => {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

/** The files outside the plot this session may read: the screens of its review, and the quest's letter. */
function openFilesOf(ctx: Pick<HookContext, 'images' | 'kingdom' | 'quest'>): string[] {
  const letter =
    ctx.kingdom === undefined || ctx.quest === undefined ? [] : [handoverPath(ctx.kingdom, ctx.quest)];
  return [...ctx.images, ...letter].map((file) => path.resolve(file));
}

/**
 * Why a read of `call` outside the plot is refused, if it is. `cwd` is the session's folder as the CLI's payload
 * names it (Claude Code and Codex `cwd`, agy `workspacePaths[0]`); without one, the hook's own, where the CLI runs it.
 */
export function outsideReadViolation(
  call: ToolCall,
  cwd: string | undefined,
  ctx: Pick<HookContext, 'images' | 'kingdom' | 'quest'>,
): string | undefined {
  if (call.kind !== 'read') return undefined;
  const root = path.resolve(cwd ?? process.cwd());
  const open = openFilesOf(ctx);
  for (const raw of call.guarded) {
    const file = path.resolve(root, raw);
    if (within(root, file) || open.some((allowed) => path.relative(allowed, file) === '')) continue;
    return `${raw} lies outside your plot; of the files outside it you may read only the screens your review lists`;
  }
  return undefined;
}
