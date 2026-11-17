// A territory's `CLAUDE.local.md` (P1-02, ADR 0007, implementation-plan §3.3): Claude Code loads the main checkout's
// personal, untracked notes into every plot inside the repo, since the plots sit in a folder under it, while the main
// checkout's CLAUDE.md, rules and settings stay out. `territory add` and `doctor` both say so.
import { access } from 'node:fs/promises';
import path from 'node:path';

const CLAUDE_LOCAL = 'CLAUDE.local.md';

/** The folder the plots of `worktreeDir` go to, when it lies inside `repo`; undefined when it lies outside. */
function plotsInside(repo: string, worktreeDir: string): string | undefined {
  const plots = path.resolve(repo, worktreeDir);
  const relative = path.relative(repo, plots);
  const outside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  return outside ? undefined : plots;
}

/** The plots folder that the repo's CLAUDE.local.md reaches, or undefined when there is none or it reaches none. */
export async function claudeLocalReach(repo: string, worktreeDir: string): Promise<string | undefined> {
  const plots = plotsInside(repo, worktreeDir);
  if (plots === undefined) return undefined;
  try {
    await access(path.join(repo, CLAUDE_LOCAL));
    return plots;
  } catch {
    return undefined;
  }
}
