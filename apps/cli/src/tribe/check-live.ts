// What `elvaria tribe check` does with the real CLI besides the suite (lessons of 2026-11-13). It runs the CLI doctor
// would find (the pinned file, else PATH or the adapter's search, or `--tool`), so a CLI a VS Code update moved is
// checked where it now is; once the suite passes it pins that CLI, path and version, for this tribe alone, its
// version the checked one the Steward holds the tribe to (B1, A1b). Before, `doctor --pin` re-pinned every tribe whose
// CLI had changed, and the coordinator pinned agy 1.5.7 for gemini alone with a script. A failed check's workspace is
// kept in the kingdom: on 2026-11-13 the folder of the `submit` past its ceiling went with every log of its session.
import { cp } from 'node:fs/promises';
import path from 'node:path';

import { err, ok } from '@elvaria/domain';
import type { Tribe } from '@elvaria/domain';
import type { FailedWorkspace } from '@elvaria/runner-core';
import { inKingdom } from '@elvaria/store';

import { checkedToolOf, locateTribeTool } from '../doctor/check-tribe.ts';
import { findingLines } from '../doctor/finding.ts';
import { backupStamp } from '../migrate.ts';
import { refuse, saveTribes } from './save.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The real CLI a check runs, as doctor finds it. */
export interface LiveTool {
  /** Portable, as kingdom.json pins it. */
  readonly path: string;
  readonly version: string;
}

/** The CLI to run, or undefined once doctor's reason why there is none is printed. */
export async function liveToolOf(
  ctx: KingdomContext,
  tribe: Tribe,
  given?: string,
): Promise<LiveTool | undefined> {
  const found = await locateTribeTool(tribe, ctx, given);
  if (!('problem' in found)) return { path: found.path, version: found.version };
  findingLines(found.problem).forEach(ctx.io.err);
  return undefined;
}

/**
 * Pins the CLI the suite passed on for `tribe` alone, and enables the tribe, in one write under the kingdom file's
 * lock; the other tribes stay as they are on disk. False once the reason is printed.
 */
export async function pinChecked(
  ctx: KingdomContext,
  tribe: Tribe & { readonly tool: NonNullable<Tribe['tool']> },
  found: LiveTool,
): Promise<boolean> {
  const tool = checkedToolOf(tribe.tool, found);
  const saved = await saveTribes(ctx, (tribes) =>
    tribes.some(({ id }) => id === tribe.id)
      ? ok(tribes.map((entry) => (entry.id === tribe.id ? { ...entry, tool, enabled: true } : entry)))
      : err(
          refuse(
            ctx.t('cli.tribe.unknown', { tribe: tribe.id, tribes: tribes.map(({ id }) => id).join(', ') }),
          ),
        ),
  );
  if (saved) ctx.io.out(ctx.t('cli.tribe.check.pinned', { tribe: tribe.id, ...found }));
  return saved;
}

/** What a failed check leaves to read: the CLI's output, settings and policy (`.runs`), the hook's events, the letter. */
const KEPT = ['.runs', 'events', 'quests'] as const;

/**
 * Where the workspaces of this run's failed checks go: `<kingdom>/.runs/tribe-check-<tribe>-<stamp>/<check>/`, beside
 * the runs of the quests and the trials of the territories.
 */
export function keepFailed(ctx: KingdomContext, tribe: Tribe): (failed: FailedWorkspace) => Promise<void> {
  const base = inKingdom(ctx.store.root, `.runs/tribe-check-${tribe.id}-${backupStamp(ctx.now())}`);
  return async ({ scenario, dir }) => {
    const kept = path.join(base, scenario);
    for (const part of KEPT)
      await cp(path.join(dir, part), path.join(kept, part), { recursive: true, force: true }).catch(
        (error: unknown) => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        },
      );
    ctx.io.err(ctx.t('cli.tribe.check.kept', { check: scenario, dir: kept }));
  };
}
