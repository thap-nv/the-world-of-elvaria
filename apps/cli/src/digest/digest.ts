// `elvaria digest`: the digest as it stands now (implementation-plan §3.16.3, PS-03), from the files and the event log,
// printed in the owner's language. It writes nothing and spends no mana, so it runs beside a Steward or without one.
// (P2-04) It lists what the Steward's own digest (digest/<day>.md, once a day) and the herald list, with the domain's
// attentionOf over the same files and log: the quests waiting for a judge and the tribes held by their CLI come from
// their lines, no longer from the running Steward's memory. Only the branches a running Steward found with nothing to
// push are its own; here such a quest counts as carried.
import { attentionOf } from '@elvaria/domain';
import type { AttentionSource, Registry } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';

import { EXIT } from '../command-table/command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { upgradeOffer } from '../upgrade/offer.ts';
import { digestMarkdown } from './markdown.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** A registry that cannot be read names no class: the items say the kingdom has none, and `doctor` says why. */
const NO_REGISTRY: Pick<Registry, 'classes' | 'kinds' | 'rituals'> = { classes: [], kinds: [], rituals: [] };

/** The files and the log the digest reads; a file that does not parse is left out, as the Steward leaves it out. */
async function sourceOf(ctx: KingdomContext): Promise<AttentionSource> {
  const { store } = ctx;
  const [territories, characters, quests, memos, verdicts, registry, log] = await Promise.all([
    store.territories.list(),
    store.characters.list(),
    store.quests.list(),
    store.memos.list(),
    store.verdicts.list(),
    store.loadRegistry(),
    openEventLog(store.root).read(),
  ]);
  return {
    kingdom: ctx.kingdom,
    territories: territories.items,
    characters: characters.items,
    quests: quests.items,
    memos: memos.items,
    verdicts: verdicts.items,
    registry: registry.ok ? registry.value : NO_REGISTRY,
    events: log.events,
  };
}

async function runDigest(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const [source, upgrade] = await Promise.all([sourceOf(ctx), upgradeOffer(ctx.io, ctx.store.root)]);
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
