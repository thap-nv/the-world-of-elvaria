// The scratch plot of the run's next judge, made again without the trial (implementation-plan §3.15; P1-42, P1-47):
// a fresh worktree at the head of the quest's branch after commands.setup, then commands.reset once, so the second
// judge does not meet the database or containers the first judge's breaks left behind ((d) of P1-42). The reset
// has a log of its own beside the setup's, `.runs/<quest>-verify-reset.log`: the trial's `rerun_clean` log stays the
// trial's. A plot that cannot be made, a setup or a reset that fails, throws, and the Steward runs the trial again,
// whose own reset then says what went wrong as a failing `rerun_clean`.
import type { Quest, Territory } from '@elvaria/domain';

import type { PlotManager } from '../plot/plot-manager.ts';
import { scratchIdOf } from '../plot/scratch.ts';
import { SETUP_TIMEOUT_MS } from '../plot/setup.ts';
import type { ProcessHost } from '../process/program.ts';
import { headerOf, openLog, runLines } from './logged-run.ts';
import { withSecrets } from './run-checks.ts';

/** Portable, relative to the kingdom; beside `.runs/<quest>-verify-setup.log`. */
export const scratchResetLogOf = (questId: string): string => `.runs/${scratchIdOf(questId)}-reset.log`;

export interface ScratchAgainRequest {
  /** The kingdom root, native. */
  readonly kingdom: string;
  readonly quest: Pick<Quest, 'id'>;
  readonly territory: Territory;
  /** The quest's secrets, for setup and reset as for the trial (P1-30, P1-10b). */
  readonly secrets?: Readonly<Record<string, string>>;
  /** Aborted when nobody waits for the plot any more (the Steward stops, the quest moved on): the reset is killed. */
  readonly signal?: AbortSignal;
}

/** Runs the territory's commands.reset once in `cwd`; nothing, and no log, when it declares none. */
async function resetOnce(request: ScratchAgainRequest, cwd: string, host: ProcessHost): Promise<void> {
  const { kingdom, quest, territory, secrets, signal } = request;
  const lines = territory.commands.reset;
  if (lines === undefined) return;
  const logPath = scratchResetLogOf(quest.id);
  const given = withSecrets(host, secrets);
  const log = await openLog(kingdom, logPath, headerOf(lines), given.known);
  const context = { cwd, host: given.host, ...(signal === undefined ? {} : { signal }) };
  const run = await runLines(lines, context, log, SETUP_TIMEOUT_MS).finally(() => log.close());
  if (run.exit_code === 0 && signal?.aborted !== true) return;
  const ended = run.timed_out ? 'timed out' : `ended with ${run.exit_code ?? 'no exit code'}`;
  throw new Error(`commands.reset of ${quest.id}'s scratch plot ${ended} (${logPath})`);
}

/** A fresh scratch plot after commands.setup, then commands.reset once (P1-47); throws when it is not ready. */
export async function scratchAgain(
  manager: PlotManager,
  request: ScratchAgainRequest,
  host: ProcessHost,
): Promise<void> {
  const { quest, territory, secrets, signal } = request;
  const prepared = await manager.prepareScratch(quest, territory, {
    ...(secrets === undefined ? {} : { secrets }),
    ...(signal === undefined ? {} : { signal }),
  });
  if (!prepared.ok) {
    const { reason, detail } = prepared.error;
    throw new Error(`the scratch plot of ${quest.id} is not ready (${reason}): ${detail}`);
  }
  await resetOnce(request, prepared.value.worktree, host);
}
