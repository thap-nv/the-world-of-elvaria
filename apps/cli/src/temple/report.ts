// What a run of the Temple tells the owner (PS-12f), the Steward's job and `elvaria temple run` alike: who reads the
// pack, then what came of it. A failed session says why, and where its prompt and output are.
import type { ChancellorFailure } from '@elvaria/chancellor';
import type { Registry, TempleEvidence } from '@elvaria/domain';

import { lineOf } from '../run/bell.ts';
import { monkClassOf } from './monk.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { TempleRun } from './run-temple.ts';

/** The class to name when no Monk speaks: the registry's first Monk class, as `character add` would take it. */
export const noMonkLine = (ctx: KingdomContext, registry: Registry | undefined): string =>
  ctx.t('cli.temple.run.no_monk', { class: (registry && monkClassOf(registry)?.id) ?? '<class>' });

export const listeningLine = (ctx: KingdomContext, name: string, evidence: TempleEvidence): string =>
  ctx.t('cli.temple.run.listening', {
    name,
    groups: evidence.groups.length,
    reviews: evidence.reviews.length,
  });

function reportFailed(ctx: KingdomContext, failure: ChancellorFailure, runDir: string): void {
  const why = failure.code === 'cli_error' ? failure.line : failure.code;
  ctx.io.err(ctx.t('cli.temple.run.failed', { why }));
  if (failure.code === 'invalid_reply')
    failure.issues.forEach((issue) => {
      ctx.io.err(`  ${issue}`);
    });
  ctx.io.err(ctx.t('cli.say.run_dir', { dir: runDir }));
}

/** Prints what came of the run; `registry` names the Monk class to add when there is no Monk. */
export function reportTemple(ctx: KingdomContext, run: TempleRun, registry?: Registry): void {
  if (run.status === 'no_monk') ctx.io.err(noMonkLine(ctx, registry));
  else if (run.status === 'held') {
    ctx.io.err(ctx.t('cli.temple.run.held'));
    run.holds.forEach((hold) => {
      ctx.io.err(lineOf(ctx.t, { kind: 'tribe_held', ...hold }));
    });
  } else if (run.status === 'waiting') ctx.io.out(ctx.t('cli.temple.run.waiting'));
  else if (run.status === 'empty') ctx.io.out(ctx.t('cli.temple.run.empty'));
  else if (run.status === 'stopped') ctx.io.err(ctx.t('cli.temple.run.stopped'));
  else if (run.status === 'failed') reportFailed(ctx, run.failure, run.run_dir);
  else if (run.status === 'sent')
    ctx.io.out(
      run.operations + run.letters === 0
        ? ctx.t('cli.temple.run.nothing')
        : ctx.t('cli.temple.run.sent', { operations: run.operations, letters: run.letters }),
    );
}
