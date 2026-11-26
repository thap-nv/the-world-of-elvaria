// `elvaria temple run` (PS-12f, temple-first plan PS-12d): the Temple once, now, whether `kingdom.schedule.temple` is
// on or due: the Monk reads the evidence pack in one session (it spends mana) and its report goes to the inbox, which a
// running Steward applies at its next tick; with nothing to decide no model is called. Like `elvaria triage` it asks the
// tribes' CLIs first: a Monk of a held tribe opens no session. `temple.ran` says the owner ran it (trigger `owner`).
import { EXIT } from '../command-table/command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { crewOf } from '../run/crew.ts';
import { tribeHoldsOf } from '../run/tool-found.ts';
import { listeningLine, reportTemple } from './report.ts';
import { runTemple } from './run-temple.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { TriageDeps } from '../triage/triage.ts';

/** `yyyy-mm-dd` of an ISO 8601 time with the kingdom's offset: its local day. */
const DAY_CHARS = 10;

async function temple(ctx: KingdomContext, deps: TriageDeps): Promise<ExitCode> {
  const runners = await deps.runnersOf({ kingdom: ctx.kingdom, root: ctx.store.root }, ctx.io);
  const result = await runTemple(ctx, runners, {
    trigger: 'owner',
    day: ctx.now().slice(0, DAY_CHARS),
    waits: { holds: (await deps.holdsOf?.(ctx, runners)) ?? [] },
    actor: { kind: 'user' },
    onListening: (name, evidence) => {
      ctx.io.out(listeningLine(ctx, name, evidence));
    },
  });
  const registry = await ctx.store.loadRegistry();
  reportTemple(ctx, result, registry.ok ? registry.value : undefined);
  return result.status === 'sent' || result.status === 'empty' ? EXIT.ok : EXIT.failed;
}

/** `deps` as `elvaria triage` takes them: the runners of the tribes that work, and their holds. */
export function templeRunCommand(deps: TriageDeps): CommandSpec {
  return {
    name: ['temple', 'run'],
    summary: 'cli.temple.run.summary',
    args: [],
    options: {},
    run: async (input: CommandInput, cli: CliContext): Promise<ExitCode> => {
      const ctx = await openKingdomContext(input, cli);
      return ctx === undefined ? EXIT.failed : temple(ctx, deps);
    },
  };
}

export const TEMPLE_RUN: CommandSpec = templeRunCommand({
  runnersOf: async (place, io) => (await crewOf(place, io)).runners,
  holdsOf: (ctx, runners) => tribeHoldsOf(ctx.kingdom, runners, ctx.io),
});
