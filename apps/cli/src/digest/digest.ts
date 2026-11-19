// `elvaria digest`: the digest as it stands now (implementation-plan §3.16.3, PS-03), from the files and the event log,
// printed in the owner's language. It writes nothing and spends no mana, so it runs beside a Steward or without one.
// The Steward's own digest (digest/<day>.md, once a day) also lists what only its memory holds: quests whose judges
// are all out of mana, or that no judge of the roster may take. (PS-12g) What waits on the Temple is the same in both: it
// comes from the files and the log alone (templeNoticesOf).
import {
  attentionQueue,
  baseHealthOf,
  baseHoldsOf,
  baseRedOf,
  deliveringOf,
  forgeOutcomesOf,
  heldQuestsOf,
  ownerDeliveries,
  scopeHoldsOf,
  sealPolicyOf,
  sealSuspendedOf,
  templeNoticesOf,
  unopenedReviewsOf,
} from '@elvaria/domain';
import type { Event, TempleNotices } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { digestStateOf, readUnclaimable } from '@elvaria/steward';

import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { upgradeOffer } from '../upgrade/offer.ts';
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

/**
 * (PS-12g) The characters suspended for a fail streak, and the repeated failures while the Temple cannot run. A registry
 * that cannot be read names no class of the Monk: the item says the kingdom has none, and `doctor` says why.
 */
async function templeOf(
  ctx: KingdomContext,
  source: Awaited<ReturnType<typeof sourceOf>>,
  events: readonly Event[],
): Promise<TempleNotices> {
  const [registry, verdicts] = await Promise.all([ctx.store.loadRegistry(), ctx.store.verdicts.list()]);
  return templeNoticesOf({
    enabled: ctx.kingdom.schedule.temple.enabled,
    classes: registry.ok ? registry.value.classes : [],
    characters: source.characters,
    quests: source.quests,
    verdicts: verdicts.items,
    memos: source.memos,
    events,
  });
}

async function runDigest(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const [source, log, unclaimable, upgrade] = await Promise.all([
    sourceOf(ctx),
    openEventLog(ctx.store.root).read(),
    readUnclaimable(ctx.store.root),
    upgradeOffer(ctx.io, ctx.store.root),
  ]);
  const now = ctx.io.clock.now();
  const patrols = baseHealthOf(log.events);
  const outcomes = forgeOutcomesOf(log.events);
  const suspended = sealSuspendedOf(log.events);
  // fix/run-221-followups: the delegation of the seal as the Steward reads it (kingdom.json, the breaker's lines), so a
  // pull request the Steward merges itself is neither waiting for the owner nor holding a scope here either.
  const policy = sealPolicyOf(ctx.kingdom, suspended);
  const items = attentionQueue(digestStateOf(source, log.events), now, {
    unclaimable: [...unclaimable.keys()],
    // fix/run-221-domain: not a quest the Steward still carries to its base branch. Only the Steward knows a branch
    // with nothing to push: here such a quest counts as carried.
    scope_held: scopeHoldsOf(
      source.quests,
      source.territories,
      deliveringOf(outcomes, source.quests, source.territories, { policy }),
    ),
    judges_unopened: unopenedReviewsOf(source.quests),
    deliveries: ownerDeliveries(outcomes.values(), source.quests, source.territories, policy),
    ...(upgrade === undefined ? {} : { upgrade }),
    // PS-26: the same health of the patrolled branches the Steward's book holds.
    patrols,
    // PS-09d: the red territories that take no work, and the open quests that wait for them.
    base_holds: baseHoldsOf(source.quests, baseRedOf(patrols, source.territories, source.quests)),
    // (D) of fix/quest-hold: the quests the owner holds.
    held: heldQuestsOf(source.quests),
    // PS-08g: the territories whose delegation of the seal the breaker suspended.
    delegation_suspended: suspended,
    ...(await templeOf(ctx, source, log.events)),
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
