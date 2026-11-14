// `elvaria triage` (PS-03b, implementation-plan §3.16.3): the Chancellor's triage of the memos waiting, run by hand,
// as the Steward runs it each day before the digest (`kingdom.schedule.triage`). One model call for the batch, none
// when no memo waits; the commands go to the inbox, and a running Steward applies them at its next tick. It asks the
// tribes' CLIs first, as the Steward does: a Chancellor of a held tribe opens no session (fix/held-tribe-sessions).
import type { TriageOutcome } from '@elvaria/chancellor';
import type { DelegationHold, TribeHold } from '@elvaria/domain';

import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { crewOf } from '../run/crew.ts';
import { tribeHoldsOf } from '../run/tool-found.ts';
import { reportDropped, reportFailure } from '../say/report.ts';
import { runTriage } from './run-triage.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { CliIo } from '../io.ts';
import type { KingdomPlace } from '../run/crew.ts';
import type { Runners } from '../say/hearing.ts';
import type { TriageRun } from './run-triage.ts';

const NONE = '—';

export interface TriageDeps {
  /** The runners of the tribes that work now; `crewOf` of `elvaria run`, a scripted runner in the specs. */
  readonly runnersOf: (place: KingdomPlace, io: CliIo) => Runners | Promise<Runners>;
  /**
   * The tribes held by their CLI's version (fix/held-tribe-sessions): `tribeHoldsOf`, which asks each CLI as the
   * Steward does; absent, none (the specs' scripted runners have no CLI).
   */
  readonly holdsOf?: (ctx: KingdomContext, runners: Runners) => Promise<readonly TribeHold[]>;
}

/** What the Chancellor would do with a memo, in the owner's language. */
export const actionText = (ctx: KingdomContext, outcome: Pick<TriageOutcome, 'action' | 'quest'>): string =>
  ctx.t(`cli.triage.action.${outcome.action}`, { quest: outcome.quest ?? NONE });

/** Why a memo is the owner's, in the owner's language. */
export const holdsText = (ctx: KingdomContext, holds: readonly DelegationHold[]): string =>
  holds.map((hold) => ctx.t(`cli.triage.hold.${hold}`)).join(', ');

/** Each memo's fate, then the commands sent and the memos left for the next triage. */
function reportSent(ctx: KingdomContext, run: Extract<TriageRun, { status: 'sent' }>): void {
  reportDropped(ctx, run.dropped);
  for (const outcome of run.outcomes) {
    const said = { memo: outcome.memo, action: actionText(ctx, outcome) };
    ctx.io.out(
      outcome.delegated
        ? ctx.t('cli.triage.delegated', said)
        : ctx.t('cli.triage.escalated', { ...said, holds: holdsText(ctx, outcome.holds) }),
    );
  }
  ctx.io.out(ctx.t('cli.triage.sent', { count: run.commands }));
  if (run.more > 0) ctx.io.out(ctx.t('cli.triage.more', { count: run.more }));
}

async function triage(ctx: KingdomContext, deps: TriageDeps): Promise<ExitCode> {
  const runners = await deps.runnersOf({ kingdom: ctx.kingdom, root: ctx.store.root }, ctx.io);
  const run = await runTriage(ctx, runners, {
    holds: (await deps.holdsOf?.(ctx, runners)) ?? [],
    onListening: (name, count) => {
      ctx.io.out(ctx.t('cli.triage.listening', { name, count }));
    },
  });
  if (run.status === 'none') {
    ctx.io.out(ctx.t('cli.triage.none'));
    return EXIT.ok;
  }
  if (run.status === 'failed') reportFailure(ctx, run.failure, run.run_dir, 'memo-triage');
  if (run.status !== 'sent') return EXIT.failed;
  reportSent(ctx, run);
  return EXIT.ok;
}

export function triageCommand(deps: TriageDeps): CommandSpec {
  return {
    name: ['triage'],
    summary: 'cli.triage.summary',
    args: [],
    options: {},
    run: async (input: CommandInput, cli: CliContext): Promise<ExitCode> => {
      const ctx = await openKingdomContext(input, cli);
      return ctx === undefined ? EXIT.failed : triage(ctx, deps);
    },
  };
}

export const TRIAGE: CommandSpec = triageCommand({
  runnersOf: async (place, io) => (await crewOf(place, io)).runners,
  holdsOf: (ctx, runners) => tribeHoldsOf(ctx.kingdom, runners, ctx.io),
});
