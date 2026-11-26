// `claude purge --yes <worktree>` after PlotManager.release removed a worktree (implementation-plan §3.3; spike
// P1-02 "Bổ sung", real run of P1-07): it deletes exactly the transcript folder Claude Code kept for that path.
// A worktree no session ever ran in leaves nothing to purge: exit 1 with "No Claude Code project state found",
// which is done, not failed (owner, after the P1-07 run). Any other failure throws, and release reports it.
import { runOnce } from './run-once.ts';
import type { Launch } from './launch.ts';
import type { RunOnceOptions } from './run-once.ts';

const NOTHING_TO_PURGE = 'No Claude Code project state found';

const firstLine = (text: string): string => text.trim().split(/\r?\n/)[0] ?? '';

export async function purgeWorktree(
  launch: Launch,
  worktree: string,
  options: RunOnceOptions,
): Promise<void> {
  const ran = await runOnce(launch, ['purge', '--yes', worktree], options);
  if (ran.code === 0) return;
  if (ran.code === 1 && ran.stderr.includes(NOTHING_TO_PURGE)) return;
  const why = ran.problem ?? (firstLine(ran.stderr) || `exit ${String(ran.code)}`);
  throw new Error(`claude purge --yes ${worktree}: ${why}`);
}
