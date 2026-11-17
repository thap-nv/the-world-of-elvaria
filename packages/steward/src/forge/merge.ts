// A sealed quest's pull request under `pr_merge` (implementation-plan §3.16.7, ADR 0023; PS-08d, (G) of the PS-08
// plan): one question to the forge outside the tick, every FORGE_POLL_SECONDS as planTick says (forgePolls). Its
// answer, in order: merged already (the owner merged by hand) ⇒ `delivery.merged`; closed ⇒ failed; a head other than
// the one pushed ⇒ `head_moved`, nothing merged or deleted; `conflict` ⇒ failed (PS-09 turns it into a merge quest);
// red required checks ⇒ `checks_red`; pending ⇒ nothing, or `checks_timeout` once checks_timeout_minutes passed since
// the push; green (or no required check and the forge says it can merge) ⇒ `Forge.merge` at the pushed head. After a
// merge the remote quest branch goes, through the forge (a push would run the pre-push hook), only while its tip is
// still the head the `delivery.pushed` named; a removal that fails leaves `branch_deleted: false` and a warning, never
// a failed delivery. A Steward that stops records nothing: the next one asks again, and finds a merge it made.
import { currentRun, deliveryOf, err, ok } from '@elvaria/domain';
import { createRedactor } from '@elvaria/eventlog';
import type { EventData, ForgePoll, Quest, Result } from '@elvaria/domain';

import { detailOf, foundOf, messageOf, stopped } from './delivery.ts';
import { recordFailed, recordMerged } from './outcome.ts';
import type { Context } from '../context.ts';
import type { Delivery } from './delivery.ts';
import type { ForgeCheck } from './forge.ts';
import type { Failure } from './outcome.ts';

type Pushed = EventData<'delivery.pushed'>;

/** What every outcome of the question names: the branch, the head pushed, the pull request. */
const aboutOf = ({ branch, head, pr }: Pushed) => ({ branch, head, pr });

const checksOf = (checks: readonly ForgeCheck[]) => (checks.length === 0 ? {} : { checks: [...checks] });

/** The remote quest branch removed after the merge; false, with a warning, when it stays. */
async function removeBranch(ctx: Context, d: Delivery, pushed: Pushed): Promise<boolean> {
  const gone = await d.forge.deleteBranch(d.repo, pushed.branch, pushed.head, d.signal);
  if (gone.ok && gone.value) return true;
  const why = gone.ok
    ? 'its tip moved or it is gone'
    : `${gone.error.reason} ${gone.error.detail ?? ''}`.trim();
  ctx.deps.log.warn(`steward: ${d.quest.id}: ${pushed.branch} stays on the remote (${why})`);
  return false;
}

/** The pull request is in the base branch at `sha`: the branch removed, then one `delivery.merged`. */
async function merged(
  ctx: Context,
  d: Delivery,
  pushed: Pushed,
  sha: string | undefined,
): Promise<Failure | undefined> {
  if (sha === undefined || sha === '') {
    const detail = 'the forge names no merge commit';
    return { stage: 'merge', reason: 'forge_error', ...aboutOf(pushed), detail };
  }
  const deleted = await removeBranch(ctx, d, pushed);
  if (stopped(d)) return undefined;
  await recordMerged(ctx, d.quest, {
    ...aboutOf(pushed),
    merge_sha: sha,
    method: deliveryOf(d.territory).merge_method,
    sealed: d.quest.seal !== undefined,
    branch_deleted: deleted,
  });
  return undefined;
}

/** `Forge.merge` at the pushed head, then the end of a merge. */
async function mergeNow(ctx: Context, d: Delivery, pushed: Pushed): Promise<Failure | undefined> {
  const method = deliveryOf(d.territory).merge_method;
  const merge = await d.forge.merge(d.repo, pushed.pr.number, { method, head: pushed.head }, d.signal);
  if (stopped(d)) return undefined;
  if (!merge.ok)
    return {
      stage: 'merge',
      reason: merge.error.reason,
      ...aboutOf(pushed),
      ...detailOf(merge.error.detail),
    };
  return merged(ctx, d, pushed, merge.value);
}

/** One question and what its answer leads to; undefined when nothing is to be recorded. */
async function ask(ctx: Context, d: Delivery, pushed: Pushed, poll: ForgePoll): Promise<Failure | undefined> {
  const about = aboutOf(pushed);
  const required = deliveryOf(d.territory).required_checks;
  const status = await d.forge.status(d.repo, pushed.pr.number, required, d.signal);
  if (stopped(d)) return undefined;
  if (!status.ok)
    return { stage: 'checks', reason: status.error.reason, ...about, ...detailOf(status.error.detail) };
  const { state, head, checks } = status.value;
  if (state === 'merged') return merged(ctx, d, pushed, status.value.merge_sha);
  if (state === 'closed')
    return {
      stage: 'merge',
      reason: 'forge_error',
      ...about,
      detail: 'the pull request was closed without a merge',
    };
  if (head !== pushed.head)
    return {
      stage: 'merge',
      reason: 'head_moved',
      ...about,
      detail: `the forge has ${head} at the head of the branch`,
    };
  if (state === 'conflict') return { stage: 'merge', reason: 'conflict', ...about };
  if (state === 'red') return { stage: 'checks', reason: 'checks_red', ...about, ...checksOf(checks) };
  if (state === 'pending')
    return poll.timed_out
      ? { stage: 'checks', reason: 'checks_timeout', ...about, ...checksOf(checks) }
      : undefined;
  return mergeNow(ctx, d, pushed);
}

/** One question about `quest`'s pull request; an error nobody foresaw fails the delivery as the forge's. */
async function askAbout(ctx: Context, quest: Quest, pushed: Pushed, poll: ForgePoll, signal: AbortSignal) {
  const found = foundOf(ctx, quest, signal);
  let failure: Failure | undefined;
  try {
    failure = found.ok ? await ask(ctx, found.value, pushed, poll) : { ...found.error, stage: 'checks' };
  } catch (error) {
    const detail = createRedactor([])(messageOf(error));
    failure = { stage: 'checks', reason: 'forge_error', ...aboutOf(pushed), detail };
  }
  if (failure !== undefined && !signal.aborted) await recordFailed(ctx, quest, failure);
}

/** Starts one question about the pull request of done quest `poll.quest` outside the tick (planTick's forge_polls). */
export function startPoll(ctx: Context, poll: ForgePoll): Result<void, string> {
  const quest = ctx.world.quests.get(poll.quest);
  const outcome = ctx.forge.outcomes.get(poll.quest);
  if (quest === undefined) return err('unknown_quest');
  if (outcome?.type !== 'delivery.pushed') return err('not_pushed');
  ctx.forge.asked.set(quest.id, ctx.deps.clock.now());
  const pushed = outcome.data;
  ctx.background.forge(quest.id, currentRun(quest), (signal) => askAbout(ctx, quest, pushed, poll, signal));
  return ok(undefined);
}
