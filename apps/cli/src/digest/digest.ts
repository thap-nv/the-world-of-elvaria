// `elvaria digest`: the digest as it stands now (implementation-plan §3.16.3, PS-03), from the files and the event log,
// printed in the owner's language. It writes nothing and spends no mana, so it runs beside a Steward or without one.
// (P2-04) It lists what the Steward's own digest (digest/<day>.md, once a day) and the herald list, with the domain's
// attentionOf over the same files and log: the quests waiting for a judge and the tribes held by their CLI come from
// their lines, no longer from the running Steward's memory. Only the branches a running Steward found with nothing to
// push are its own; here such a quest counts as carried. The files and the log are read by the store's
// readKingdomSource, the Herald's reader too (P2-01c), so both list the same.
import { attentionOf } from '@elvaria/domain';
import { readKingdomSource } from '@elvaria/store';

import { EXIT } from '../command-table/command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { upgradeOffer } from '../upgrade/offer.ts';
import { digestMarkdown } from './markdown.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';

async function runDigest(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const [source, upgrade] = await Promise.all([
    readKingdomSource(ctx.store, ctx.kingdom),
    upgradeOffer(ctx.io, ctx.store.root),
  ]);
  const items = attentionOf(source, ctx.io.clock.now(), upgrade === undefined ? {} : { upgrade });
  // ctx.now() is written in the kingdom's zone: its date is the kingdom's local day, as the digest's file names it.
  const day = ctx.now().slice(0, 'yyyy-mm-dd'.length);
  const markdown = digestMarkdown(ctx.t, { day, name: ctx.kingdom.name, items });
  markdown.trimEnd().split('\n').forEach(ctx.io.out);
  ctx.io.out('');
  ctx.io.out(ctx.t('cli.digest.live_note'));
  return EXIT.ok;
}

export const DIGEST: CommandSpec = {
  name: ['digest'],
  summary: 'cli.digest.summary',
  args: [],
  options: {},
  run: runDigest,
};
