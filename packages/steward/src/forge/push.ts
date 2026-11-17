// A done quest's delivery to its forge, outside the tick (implementation-plan §3.16.7, ADR 0023; PS-08c), in order:
// the secret scan of what the branch adds over the base branch (scan.ts), `git push` of quest/<id> alone (never
// forced, never the base branch; the territory's pre-push hook runs as when the owner pushes), then the branch's pull
// request, found or opened with the delivery note as its description, and one `delivery.pushed`. Each step may run
// again: a Steward stopped between the push and the pull request pushes the same head again (git says it is up to
// date) and finds the pull request it opened. Any step that fails records one `delivery.failed` and stops; nothing is
// tried again until the owner's `deliver`. A stop of the Steward records nothing: the next one delivers anew.
import { readFile } from 'node:fs/promises';

import { currentRun, deliveryOf, err, ok } from '@elvaria/domain';
import { createRedactor } from '@elvaria/eventlog';
import { inKingdom, writeFileAtomic } from '@elvaria/store';
import type { Quest, QuestId, Result } from '@elvaria/domain';

import { deliveryNoteOf } from '../deliver/note.ts';
import { detailOf, forgeError, foundOf, messageOf, stopped } from './delivery.ts';
import { runDeliveryGit } from './git.ts';
import { recordFailed, recordPushed } from './outcome.ts';
import { scanDiff } from './scan.ts';
import type { Context } from '../context.ts';
import type { Delivery } from './delivery.ts';
import type { Failure } from './outcome.ts';

const MS_PER_MINUTE = 60_000;
const PUSH_TIMEOUT_MINUTES = 30;
/** A push runs the territory's pre-push hook, a check of minutes: it has half an hour, then its tree is killed. */
export const PUSH_TIMEOUT_MS = PUSH_TIMEOUT_MINUTES * MS_PER_MINUTE;
/** Local git (rev-parse, diff) is quick. */
const LOCAL_GIT_TIMEOUT_MINUTES = 2;
const LOCAL_GIT_TIMEOUT_MS = LOCAL_GIT_TIMEOUT_MINUTES * MS_PER_MINUTE;

/** Portable, relative to the kingdom: the push's output, masked. */
export const pushLogOf = (quest: QuestId): string => `.runs/${quest}-delivery/push.log`;

/** git in the plot with a short limit; its trimmed stdout, or undefined when it failed. */
async function localGit(d: Delivery, args: readonly string[]): Promise<string | undefined> {
  const run = await runDeliveryGit(d.git, d.worktree, args, {
    timeout_ms: LOCAL_GIT_TIMEOUT_MS,
    signal: d.signal,
  });
  return run.code === 0 ? run.output.trim() : undefined;
}

/** The base branch as the remote has it when git knows (forkPoint fetched it), else the local one. */
async function baseOf(d: Delivery): Promise<string> {
  const remote = await localGit(d, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${d.base}`]);
  return remote === undefined ? d.base : `origin/${d.base}`;
}

/** The treasury's values: the scan looks for each, and every log and message is masked with them. */
async function knownOf(ctx: Context): Promise<string[]> {
  return Object.values(await ctx.deps.treasury.resolve(await ctx.deps.treasury.names()));
}

/** `git push` of the branch alone, its output masked into push.log; the output's end when git refused. */
async function push(ctx: Context, d: Delivery, known: readonly string[]): Promise<Result<void, string>> {
  const refspec = `${d.branch}:refs/heads/${d.branch}`;
  const args = ['push', 'origin', refspec];
  const run = await runDeliveryGit(d.git, d.worktree, args, {
    timeout_ms: PUSH_TIMEOUT_MS,
    signal: d.signal,
  });
  const masked = createRedactor(known)(`$ git ${args.join(' ')}\n${run.output}\n`);
  await writeFileAtomic(inKingdom(ctx.root, pushLogOf(d.quest.id)), masked);
  if (run.code === 0) return ok(undefined);
  return err(
    run.stopped && !d.signal.aborted ? `${masked}\nstopped after ${PUSH_TIMEOUT_MINUTES} minutes` : masked,
  );
}

/** The steps after the plot is found; undefined when the Steward stopped, which records nothing. */
async function deliverFound(ctx: Context, d: Delivery): Promise<Failure | undefined> {
  const base = await baseOf(d);
  const ahead = await localGit(d, ['rev-list', '--count', `${base}..HEAD`]);
  const head = await localGit(d, ['rev-parse', 'HEAD']);
  const diff = await localGit(d, [
    '-c',
    'core.quotePath=false',
    'diff',
    '--no-color',
    '--no-ext-diff',
    '-U0',
    `${base}...HEAD`,
  ]);
  if (stopped(d)) return undefined;
  if (ahead === undefined || head === undefined || diff === undefined)
    return {
      stage: 'scan',
      reason: 'push_refused',
      branch: d.branch,
      detail: `git cannot read ${d.branch} against ${base}`,
    };
  if (ahead === '0') {
    ctx.forge.nothing.add(d.quest.id);
    return undefined;
  }
  const known = await knownOf(ctx);
  const scan = scanDiff(diff, known);
  if (scan.secrets.length > 0)
    return { stage: 'scan', reason: 'secret', branch: d.branch, paths: [...scan.secrets] };
  const pushed = await push(ctx, d, known);
  if (stopped(d)) return undefined;
  if (!pushed.ok) return { stage: 'push', reason: 'push_refused', branch: d.branch, detail: pushed.error };
  return openPullRequest(ctx, d, { head, known, warnings: scan.warnings });
}

/** The branch's pull request, the delivery note (masked) as its description; `delivery.pushed` once it exists. */
async function openPullRequest(
  ctx: Context,
  d: Delivery,
  pushed: { readonly head: string; readonly known: readonly string[]; readonly warnings: readonly string[] },
): Promise<Failure | undefined> {
  const note = await readFile(inKingdom(ctx.root, deliveryNoteOf(d.quest)), 'utf8');
  const body = createRedactor(pushed.known)(note);
  const draft = { head: d.branch, base: d.base, title: d.quest.title, body };
  const opened = await d.forge.open(d.repo, draft, d.signal);
  if (stopped(d)) return undefined;
  const { head, warnings } = pushed;
  if (!opened.ok)
    return {
      stage: 'open',
      reason: opened.error.reason,
      branch: d.branch,
      head,
      ...detailOf(opened.error.detail),
    };
  const forge = deliveryOf(d.territory).forge;
  await recordPushed(ctx, d.quest, {
    branch: d.branch,
    head,
    forge,
    pr: opened.value,
    ...(warnings.length === 0 ? {} : { warnings: [...warnings] }),
  });
  return undefined;
}

/** One delivery; an error nobody foresaw (a treasury that cannot be read, a note gone) fails it as the forge's. */
async function deliverQuest(ctx: Context, quest: Quest, signal: AbortSignal): Promise<void> {
  const found = foundOf(ctx, quest, signal);
  let failure: Failure | undefined;
  try {
    failure = found.ok ? await deliverFound(ctx, found.value) : found.error;
  } catch (error) {
    failure = forgeError(quest.plot.branch ?? '', createRedactor([])(messageOf(error)));
  }
  if (failure !== undefined && !signal.aborted) await recordFailed(ctx, quest, failure);
}

/** Starts the delivery of done quest `id` outside the tick (planTick's forge_deliveries). */
export function startDelivery(ctx: Context, id: QuestId): Result<void, string> {
  const quest = ctx.world.quests.get(id);
  if (quest === undefined) return err('unknown_quest');
  ctx.background.forge(id, currentRun(quest), (signal) => deliverQuest(ctx, quest, signal));
  return ok(undefined);
}
