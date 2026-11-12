// `elvaria digest`: the digest as it stands now (implementation-plan §3.16.3, PS-03), from the files and the event log,
// printed in the owner's language. It writes nothing and spends no mana, so it runs beside a Steward or without one.
// The Steward's own digest (digest/<day>.md, once a day) also lists what only its memory holds: quests whose judges
// are all out of mana, or that no judge of the roster may take.
import { attentionQueue, scopeHoldsOf } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { digestStateOf, readUnclaimable } from '@elvaria/steward';

import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { digestMarkdown } from './markdown.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The files the digest reads; a file that does not parse is left out, as the Steward leaves it out. */
async function sourceOf(ctx: KingdomContext) {
  const { store } = ctx;
  const [territories, characters, quests, memos] = await Promise.all([
    store.territories.list(),
    store.characters.list(),
    store.quests.list(),
    store.memos.list(),
  ]);
  return {
    kingdom: ctx.kingdom,
    territories: territories.items,
    characters: characters.items,
    quests: quests.items,
    memos: memos.items,
  };
}

async function runDigest(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const [source, log, unclaimable] = await Promise.all([
    sourceOf(ctx),
    openEventLog(ctx.store.root).read(),
    readUnclaimable(ctx.store.root),
  ]);
  const now = ctx.io.clock.now();
  const items = attentionQueue(digestStateOf(source, log.events), now, {
    unclaimable: [...unclaimable.keys()],
    scope_held: scopeHoldsOf(source.quests, source.territories),
  });
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
