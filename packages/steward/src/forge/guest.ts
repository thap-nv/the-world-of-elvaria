// A guest entry's turn in its territory's merge queue (CM-07, ADR 0032, plans/check-modes.md "mục khách"), outside
// the tick (planTick's guest_runs), in order: the forge asked where the pull request stands, so its branch and head are
// the forge's word, not the owner's (merged or closed already: refused `not_open`; (RC-04, R-D) one the forge says
// cannot merge cleanly: refused `conflict`, no check run); then the try (Plots.guest,
// runner-core's tryGuest): the head merged into origin's default branch as a commit no ref names, its checks run in the
// territory's check mode in the plot guest-<territory>, their `check.*` lines marked `delivery` and `guest` so the
// metrics leave them out. A conflict, git's failure, commands.setup or a check red refuse the guest; a check set aside
// for its environment is as green, as in the queue's update (update.ts). Green: the forge merges the pull request only
// while its head is the one tried, `delivery.guest_merged`, and the patrol after a merge follows (CM-03). The
// Steward never writes to the session's branch (ADR 0023: it merges through the forge only). A stop records nothing
// but the `check.end` of the checks it killed: the next Steward tries the guest from the start.
// (RC-04, ADR 0035) The checks green on the merge's tree are carried (the check ledger), so a guest queued again with
// the same head on the same base runs only the checks that were red; `check.end` names the tree for the next one.
import { DELIVERY_DETAIL_MAX_LENGTH, deliveryOf, environmentFailureOf } from '@elvaria/domain';
import { recordPatrolMerge } from '../patrol/book.ts';
import { fromPortable } from '@elvaria/store';
import type { CheckRunMode, GuestTrial, GuestTrialRequest } from '@elvaria/runner-core';
import type { EventData, GuestEntry, Territory, TerritoryTrial } from '@elvaria/domain';

import { carriedFor, endChecksOf, factsOf } from '../check-ledger/carry.ts';
import { STEWARD } from '../quest/record.ts';
import { detailOf, messageOf } from './delivery.ts';
import type { Context } from '../context.ts';
import type { Forge, ForgeRepo, PullStatus } from './forge.ts';

type Refused = EventData<'delivery.guest_refused'>;
type GuestCarry = NonNullable<GuestTrialRequest['carry']>;
type Merged = EventData<'delivery.guest_merged'>;
/** What a turn ends with, beyond the guest's territory and number; undefined: stopped, nothing to record. */
type Ending =
  | { readonly type: 'delivery.guest_refused'; readonly data: Omit<Refused, 'territory' | 'pr'> }
  | { readonly type: 'delivery.guest_merged'; readonly data: Omit<Merged, 'territory' | 'pr'> };

interface Turn {
  readonly ctx: Context;
  readonly guest: GuestEntry;
  readonly territory: Territory;
  readonly forge: Forge;
  readonly repo: ForgeRepo;
  readonly signal: AbortSignal;
}

const refused = (data: Omit<Refused, 'territory' | 'pr'>): Ending => ({
  type: 'delivery.guest_refused',
  data,
});

/** The Steward stopped: asked anew after each await, which TypeScript's narrowing cannot see (delivery.ts). */
const stopped = (signal: AbortSignal): boolean => signal.aborted;

/** The forge's adapter and the repo; why not, as the guest's refusal. */
function turnOf(ctx: Context, guest: GuestEntry, signal: AbortSignal): Turn | Ending {
  const territory = ctx.world.territories.get(guest.territory);
  if (territory === undefined) return refused({ reason: 'forge_error', detail: 'the territory is gone' });
  const id = deliveryOf(territory).forge;
  const forge = ctx.deps.forges?.adapters[id];
  if (forge === undefined)
    return refused({ reason: 'forge_error', detail: `this Steward has no adapter for the forge ${id}` });
  const repo = forge.repoOf(territory.vcs.remote ?? '', fromPortable(territory.path));
  if (repo === undefined)
    return refused({ reason: 'forge_error', detail: `vcs.remote names no repo on ${id}` });
  return { ctx, guest, territory, forge, repo, signal };
}

/** A `check.*` line of the guest's checks; one that cannot be written costs the owner a line, never the turn. */
async function note(turn: Turn, type: 'check.start' | 'check.end', data: Record<string, unknown>) {
  const { ctx, guest } = turn;
  try {
    await ctx.record.note({ type, actor: STEWARD, territory: guest.territory, data });
  } catch (error) {
    ctx.deps.log.warn(
      `steward: guest #${guest.pr} of ${guest.territory}: no ${type} line: ${messageOf(error)}`,
    );
  }
}

/** What `check.end` says of the trial: what each check gave, or that they could not run or were stopped. */
function endOf(trial: TerritoryTrial | undefined, signal: AbortSignal) {
  if (signal.aborted) return { outcome: 'stopped', checks: [] };
  if (trial === undefined || trial.plot_failure !== undefined) return { outcome: 'error', checks: [] };
  const { setup, checks } = trial;
  const environment = environmentFailureOf(checks);
  return {
    outcome: setup?.pass !== false && checks.every(({ pass }) => pass) ? 'pass' : 'fail',
    checks: endChecksOf(checks),
    ...(environment === undefined
      ? {}
      : { environment: { check: environment.check, line: environment.line } }),
  };
}

/** (RC-04, ADR 0035) What the try's checks ran on, for the ledger: the merge's tree, a narrow run's base. */
const factsOfTry = (territory: Territory, tried: GuestTrial | undefined, mode: CheckRunMode) =>
  tried?.state === 'tried'
    ? factsOf(territory, {
        ...(tried.tree === undefined ? {} : { tree: tried.tree }),
        ...(mode === 'narrow' ? { base: tried.base } : {}),
      })
    : {};

/**
 * The try, with its `check.start` once the merge is made and its `check.end` after; thrown: git refused it.
 * (RC-04) The checks green on the merge's tree are carried (the ledger), and `check.end` names that tree.
 */
async function tryIt(turn: Turn, pull: Pick<PullStatus, 'branch' | 'head'>): Promise<GuestTrial> {
  const { ctx, guest, territory, signal } = turn;
  const plots = ctx.deps.plots;
  if (plots.guest === undefined) return { state: 'failed', detail: 'this Steward cannot try a guest' };
  const mark = (mode: CheckRunMode) => ({
    delivery: true,
    guest: guest.pr,
    ...(mode === 'narrow' ? { mode } : {}),
  });
  let mode: CheckRunMode | undefined;
  const started = async (given: CheckRunMode): Promise<void> => {
    mode = given;
    await note(turn, 'check.start', mark(given));
  };
  let tried: GuestTrial | undefined;
  try {
    const carry: GuestCarry = (point) => carriedFor(ctx, territory, point);
    tried = await plots.guest(territory, { ...pull, started, carry }, signal);
    return tried;
  } finally {
    const trial = tried?.state === 'tried' ? tried.run.trial : undefined;
    if (mode !== undefined)
      await note(turn, 'check.end', {
        ...mark(mode),
        ...endOf(trial, signal),
        ...factsOfTry(territory, tried, mode),
      });
  }
}

/** Why the trial is red: commands.setup, or the red checks; undefined when green or set aside. */
function redOf(turn: Turn, trial: TerritoryTrial): Refused['checks'] | undefined {
  const lineOf = ({ timed_out, error_line }: { timed_out: boolean; error_line?: string | undefined }) => ({
    ...(timed_out ? { timed_out: true as const } : {}),
    ...(error_line === undefined || error_line === '' ? {} : { line: error_line }),
  });
  if (trial.setup !== null && !trial.setup.pass) return [{ id: 'setup', ...lineOf(trial.setup) }];
  const red = trial.checks.filter(({ pass }) => !pass);
  if (red.length === 0) return undefined;
  const environment = environmentFailureOf(trial.checks);
  if (environment === undefined) return red.map((check) => ({ id: check.id, ...lineOf(check) }));
  const { guest, ctx } = turn;
  ctx.deps.log.warn(
    `steward: guest #${guest.pr} of ${guest.territory}: its checks set aside (${environment.check}: ${environment.line})`,
  );
  return undefined;
}

/** The pull request merged through the forge while its head is still the one tried. */
async function mergeIt(turn: Turn, pull: Pick<PullStatus, 'branch' | 'head'>): Promise<Ending | undefined> {
  const { forge, repo, guest, territory, signal } = turn;
  const method = deliveryOf(territory).merge_method;
  const merged = await forge.merge(repo, guest.pr, { method, head: pull.head }, signal);
  if (signal.aborted) return undefined;
  if (merged.ok) return { type: 'delivery.guest_merged', data: { ...pull, merge_sha: merged.value, method } };
  const { reason, detail } = merged.error;
  const why = reason === 'head_moved' || reason === 'conflict' ? reason : 'forge_error';
  return refused({ reason: why, ...pull, ...detailOf(detail) });
}

/** The turn's end: refused or merged; undefined when the Steward stopped. */
async function endingOf(turn: Turn): Promise<Ending | undefined> {
  const { forge, repo, guest, signal } = turn;
  const status = await forge.status(repo, guest.pr, [], signal);
  if (signal.aborted) return undefined;
  if (!status.ok) return refused({ reason: 'forge_error', ...detailOf(status.error.detail) });
  const { state, branch, head } = status.value;
  const pull = { branch, head };
  if (state === 'merged' || state === 'closed') return refused({ reason: 'not_open', ...pull });
  // (RC-04, R-D) The forge already knows it cannot merge (GitHub's `mergeable` false): no try, no check.
  if (state === 'conflict') return refused({ reason: 'conflict', ...pull });
  let tried: GuestTrial;
  try {
    tried = await tryIt(turn, pull);
  } catch (error) {
    return stopped(signal)
      ? undefined
      : refused({ reason: 'update_failed', ...pull, detail: messageOf(error) });
  }
  if (stopped(signal)) return undefined;
  if (tried.state === 'conflict')
    return refused({
      reason: 'conflict',
      ...pull,
      ...(tried.paths.length === 0 ? {} : { paths: [...tried.paths] }),
    });
  if (tried.state === 'failed') return refused({ reason: 'update_failed', ...pull, detail: tried.detail });
  const { trial } = tried.run;
  if (trial.plot_failure !== undefined)
    return refused({ reason: 'update_failed', ...pull, detail: trial.plot_failure });
  const checks = redOf(turn, trial);
  return checks === undefined ? mergeIt(turn, pull) : refused({ reason: 'checks_red', ...pull, checks });
}

/** The end of a long message: git's and the forge's last lines say why. */
const cut = (data: Ending['data']) =>
  'detail' in data && data.detail !== undefined
    ? { ...data, detail: data.detail.trim().slice(-DELIVERY_DETAIL_MAX_LENGTH) }
    : data;

/** One guest's turn, from the forge's word to its line; the guest book forgets it once its line is written. */
export async function guestTurn(ctx: Context, guest: GuestEntry, signal: AbortSignal): Promise<void> {
  const turn = turnOf(ctx, guest, signal);
  const ending = 'type' in turn ? turn : await endingOf(turn);
  if (ending === undefined || signal.aborted) return;
  const { territory, pr } = guest;
  await ctx.record.note({
    type: ending.type,
    actor: STEWARD,
    territory,
    data: { territory, pr, ...cut(ending.data) },
  });
  if (ending.type === 'delivery.guest_merged') {
    // As after a quest's merge (recordMerged): the next tick looks at the base branch, the patrol follows (CM-03).
    ctx.looks.looked.delete(territory);
    recordPatrolMerge(ctx.patrol, territory, ending.data.merge_sha);
  } else ctx.deps.log.warn(`steward: guest #${pr} of ${territory} refused (${ending.data.reason})`);
}

/** Starts the turn of `guest` outside the tick, in its territory's lane (planTick's guest_runs). */
export function startGuest(ctx: Context, guest: GuestEntry): void {
  ctx.guests.start(guest, (signal) => guestTurn(ctx, guest, signal));
}
