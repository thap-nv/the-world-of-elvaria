// What a patrol's probe asks of the Steward once it traced red checks to a merged quest (CM-06, ADR 0033,
// plans/check-modes.md "Lần trượt muộn"), before its `check.attributed` line: a stop between them leaves the checks
// unattributed, the next probe concludes the same and finds what this wrote. The quest stays archived. Its own change
// (`own_change`): a late machine verdict on its last run, which enters the windows of its doer and of the judge who
// passed it with no quest move to carry it, one `character.judged` line each (owner's (477)); then a fix quest under
// it, claimed for its doer when the doer may take it now. A merge of both sides (`combination`): the fix quest alone,
// for anyone, nobody blamed. Its id derives from the quest and the first red commit (childIdOf: the archived quest's
// updated_at no longer moves), so a probe run again opens no second one; above kingdom.delegation.max_rank it is a
// draft for the owner's `confirm` (C7).
import {
  isEventOf,
  lateFixDueOf,
  lateFixHolderOf,
  lateFixOf,
  poolOpenOf,
  questFromCommand,
} from '@elvaria/domain';
import type {
  CharacterId,
  CheckAttributedData,
  LateFixDue,
  Quest,
  RedCheck,
  Territory,
  VerdictCheck,
} from '@elvaria/domain';

import { moveAndRing } from '../bell/move-and-ring.ts';
import { childIdOf } from '../deliver/subquests.ts';
import { redChecksOf } from '../forge/queue-merge.ts';
import { STEWARD } from '../quest/record.ts';
import { overturnedEdits, writeLateVerdict } from '../review/late-verdict.ts';
import { judged, levelAfterVerdict } from '../review/verdicts.ts';
import type { Context } from '../context.ts';
import type { LateVerdict } from '../review/late-verdict.ts';

/** How long each red check ran at the territory's latest patrol; commands.setup's time is not kept (0). */
async function durationsOf(ctx: Context, territory: Territory): Promise<ReadonlyMap<string, number>> {
  const { events } = await ctx.deps.events.read();
  const ran = events.findLast(
    (event) => isEventOf(event, 'patrol.ran') && event.data.territory === territory.id,
  );
  const runs = ran !== undefined && isEventOf(ran, 'patrol.ran') ? ran.data.checks : [];
  return new Map(runs.map(({ id, duration_ms: ms }) => [id, ms]));
}

/** The red checks of the patrol as a verdict's: what the late verdict names and the fix quest reads. */
async function verdictChecksOf(ctx: Context, territory: Territory, red: readonly RedCheck[]) {
  const durations = await durationsOf(ctx, territory);
  return red.map(({ check, log_path: log }): VerdictCheck => ({
    // A check id of the territory or commands.setup's; lateVerdictOf parses the verdict they make.
    id: check as VerdictCheck['id'],
    pass: false,
    duration_ms: durations.get(check) ?? 0,
    log_path: log,
  }));
}

/** The late verdict's share for one character, unless its window holds it already (written before a stop). */
async function judgeOne(
  ctx: Context,
  quest: Quest,
  late: LateVerdict,
  id: CharacterId,
  role: 'assignee' | 'judge',
) {
  const { verdict } = late;
  const character = ctx.world.characters.get(id);
  if (character === undefined || character.reputation.window.some((e) => e.verdict_id === verdict.id)) return;
  const edit = role === 'assignee' ? judged(quest, verdict) : overturnedEdits(ctx, quest, late)[id];
  if (edit === undefined) return;
  const line = { quest, data: { verdict: verdict.id, role } };
  const changed = await ctx.record.change(character.id, 'character.judged', edit, STEWARD, line);
  if (!changed.ok) ctx.deps.log.warn(`steward: ${quest.id}: ${id} not judged late: ${changed.error}`);
  // As after any verdict of a doer (moveOnVerdict); the judge's level does not move on it (withOverturnedPass).
  else if (role === 'assignee') await levelAfterVerdict(ctx, changed.value);
}

/** The late verdict of the archived quest and the windows of its doer and its judge. */
async function judgeLate(ctx: Context, quest: Quest, checks: readonly VerdictCheck[]): Promise<void> {
  const late = await writeLateVerdict(ctx, quest, checks);
  if (!late.ok) {
    ctx.deps.log.warn(`steward: ${quest.id}: no late verdict: ${late.error}`);
    return;
  }
  if (typeof quest.assignee === 'string') await judgeOne(ctx, quest, late.value, quest.assignee, 'assignee');
  if (late.value.judge !== undefined) await judgeOne(ctx, quest, late.value, late.value.judge, 'judge');
}

/** The doer of the origin when it may take the fix now: of its class, of an enabled tribe, its pool open. */
function holderOf(ctx: Context, due: LateFixDue, origin: Quest, fix: Quest) {
  const doer = typeof origin.assignee === 'string' ? ctx.world.characters.get(origin.assignee) : undefined;
  const { kingdom } = ctx.world;
  const pool = {
    kingdom,
    asleep: ctx.mana.asleep,
    mana: { readings: ctx.mana.readings, config: kingdom.mana },
  };
  const asleep = doer !== undefined && !poolOpenOf(pool, ctx.deps.clock.now())(doer);
  return lateFixHolderOf({ cause: due.cause, fix, doer, tribes: kingdom.tribes, asleep });
}

/** The fix quest, opened now or found; claimed for the origin's doer when lateFixHolderOf names it. */
async function openLateFix(
  ctx: Context,
  territory: Territory,
  origin: Quest,
  due: LateFixDue,
  red: readonly VerdictCheck[],
) {
  const id = childIdOf(ctx, origin, `fix-${due.commit}`);
  if (ctx.world.quests.has(id) || (await ctx.deps.store.quests.read(id)).ok) return;
  const payload = lateFixOf({
    origin,
    cause: due.cause,
    checks: await redChecksOf(ctx, red),
    base: { branch: territory.vcs.default_branch ?? '', commit: due.commit },
    max_rank: ctx.world.kingdom.delegation.max_rank,
    kinds: ctx.world.registry.kinds,
    locale: ctx.world.kingdom.owner.locale,
  });
  const made = questFromCommand(payload, {
    id,
    at: ctx.record.stamp(),
    breakers: ctx.world.kingdom.breakers,
    registry: ctx.world.registry,
    territories: [...ctx.world.territories.values()],
    quests: [...ctx.world.quests.keys()],
  });
  if (!made.ok) {
    ctx.deps.log.warn(`steward: ${origin.id}: no fix quest: ${made.error.code}`);
    return;
  }
  const put = await ctx.record.put(made.value, payload.draft ? 'quest.drafted' : 'quest.created', STEWARD);
  if (!put.ok) {
    ctx.deps.log.warn(`steward: ${origin.id}: its fix quest was not written: ${put.error}`);
    return;
  }
  const holder = holderOf(ctx, due, origin, put.value);
  const level = holder === undefined ? undefined : ctx.world.characters.get(holder)?.level;
  if (holder === undefined || level === undefined) return;
  const claimed = await moveAndRing(ctx, {
    quest: id,
    event: { type: 'claim', assignee: holder, level },
    actor: 'steward',
  });
  if (!claimed.ok) ctx.deps.log.warn(`steward: ${id}: not claimed for ${holder}: ${claimed.error}`);
}

/**
 * The late verdict and the fix quest a patrol's attribution asks for; nothing for `flaky`, `outside`, `unknown`, nor
 * for the queue's line. `red` is the territory's health: the red checks the line names.
 */
export async function lateFixAfter(
  ctx: Context,
  territory: Territory,
  data: CheckAttributedData,
  red: readonly RedCheck[],
): Promise<void> {
  const due = lateFixDueOf(data);
  const origin = due === undefined ? undefined : ctx.world.quests.get(due.origin);
  if (due === undefined || origin === undefined) return;
  const checks = await verdictChecksOf(
    ctx,
    territory,
    red.filter(({ check }) => data.checks.includes(check)),
  );
  if (due.cause === 'own_change') await judgeLate(ctx, origin, checks);
  await openLateFix(ctx, territory, origin, due, checks);
}
