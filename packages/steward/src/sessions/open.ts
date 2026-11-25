// Opening a session (implementation-plan §3.1 steps 4–6, §2.5): the plot, the request, the spawn, then the quest's
// move with the session's id and the character's move with it. A move the state machine refuses kills the session
// it was for, so no session ever runs for a quest the files do not say it runs for.
import { currentRun, endedInCut, err, ok, resumedSession } from '@elvaria/domain';
import type { Character, CharacterId, Quest, QuestId, Result, Revival } from '@elvaria/domain';
import type { AgentRunner, Continuation, ParseOptions, RunningSession } from '@elvaria/runner-core';

import { heardBy } from '../mana/heard.ts';
import { deliverAdvisories } from '../memos/advisory.ts';
import { mergeParts, plotOptionsOf } from '../party/plot.ts';
import { step } from '../quest/record.ts';
import { checksRunOf, takeChecks } from '../review/checks.ts';
import { inScratch, judgeMayOpen } from '../review/scratch.ts';
import { judgeParseOf } from '../review/verdict-file.ts';
import { secretsBreaker } from './breaker.ts';
import { continuationOf, goesOnInRun, refusedWhileWaiting } from './continuation.ts';
import { assigneeUnopened, judgeUnopened, unopenedLine } from './no-session.ts';
import { branchHeadOf } from './progress.ts';
import { fittedRequestOf } from './letter-fit.ts';
import type { SessionRequest } from './request.ts';
import { clearWrapUp } from './wrap-up.ts';
import { questSecretsOf, rememberSecrets, secretsLacking } from './secrets.ts';
import { spawnOf } from './spawn.ts';
import type { Context } from '../context.ts';
import type { MovePayload } from '../quest/record.ts';
import type { Resume, SessionInput } from './input.ts';
import type { Running } from './running.ts';

/** The quest, the character and the runner a session needs; a gap is a reason not to open it. */
function partsOf(ctx: Context, questId: QuestId, characterId: CharacterId | null | undefined) {
  const quest = ctx.world.quests.get(questId);
  if (quest === undefined) return err('unknown_quest');
  const character = typeof characterId === 'string' ? ctx.world.characters.get(characterId) : undefined;
  if (character === undefined) return err('unknown_character');
  const territory = ctx.world.territories.get(quest.territory);
  if (territory === undefined) return err('unknown_territory');
  const runner: AgentRunner | undefined = ctx.deps.runners[character.tribe];
  if (runner === undefined) return err('no_runner');
  return ok({ quest, character, territory, runner });
}

/**
 * The plot, its `commands.setup` given the quest's secrets as its checks are (P1-30): an install from a private
 * registry would fail before any session. The openings asked secretsLacking first (P1-06), so a quest without them
 * is in the infirmary, not here; a quest that asks for none reads no treasury and gives setup none. A new worktree
 * starts on the branch the quest builds on, and a merge quest's knight finds its parts merged (P1-18).
 */
async function plotFor(ctx: Context, input: Pick<SessionInput, 'quest' | 'territory' | 'role' | 'scratch'>) {
  // A judge of tests as the product works in the scratch plot its trial just made (ADR 0022, P1-20).
  if (input.scratch === true) return ctx.deps.plots.scratch(input.quest, input.territory);
  const secrets = await questSecretsOf(ctx, input.quest, input.territory);
  const given = Object.keys(secrets).length === 0 ? undefined : secrets;
  const prepared = await ctx.deps.plots.prepare(
    input.quest,
    input.territory,
    plotOptionsOf(ctx, input.quest, given),
  );
  if (input.role === 'assignee') await mergeParts(ctx, input.quest, prepared.plot, given);
  return prepared;
}

/** A session whose quest moved: the Steward keeps it until it ends, and counts it among this tick's starts. */
function keep(ctx: Context, running: Running): void {
  ctx.sessions.add(running);
  ctx.counts.started += 1;
}

/** A session that spawned: the plot the quest gets, what its prompt carried (PS-01b), its advisories (PS-09c). */
interface Spawned extends Pick<SessionRequest, 'load_trace' | 'advisories'> {
  readonly session: RunningSession;
  readonly plot: Quest['plot'];
  readonly spawned_at: string;
  readonly head: string | null | undefined;
}

/**
 * Prepares the plot, builds the request and spawns as the tribe's limits ask (spawnOf, P1-33). `resume` continues
 * that CLI session with a prompt carrying only what is new (ADR 0017); the session's in-band mana windows are heard
 * by the gauge (§3.5). A failure is logged whole and says, for the owner, who could not open a session and why
 * (no-session.ts).
 */
async function spawnFor(
  ctx: Context,
  runner: AgentRunner,
  input: Omit<SessionInput, 'cwd'>,
  resume: Resume | null = null,
  parse?: ParseOptions,
): Promise<Result<Spawned, string>> {
  try {
    const prepared = await plotFor(ctx, input);
    const quest = { ...input.quest, plot: prepared.plot };
    const built = await fittedRequestOf(ctx, { ...input, quest, cwd: prepared.cwd }, resume);
    const { request, ...carried } = built; // its load trace and advisories go with the session
    const head = input.role === 'assignee' ? await branchHeadOf(ctx, prepared.plot) : undefined; // before the CLI starts
    const session = heardBy(ctx.mana, input.character, await spawnOf(ctx, runner, request, parse));
    const spawnedAt = ctx.record.stamp(); // right after the spawn: a restart tells the process by it (pids.ts)
    // Keyed by the session the Steward keeps (heardBy's wrapper): maskFinished finds it from Running.session.
    rememberSecrets(session, request);
    return ok({ ...carried, session, plot: prepared.plot, spawned_at: spawnedAt, head });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.deps.log.warn(`steward: ${input.quest.id}: no session for ${input.character.id}: ${message}`);
    return err(unopenedLine(message));
  }
}

export type Opening =
  | { readonly kind: 'start' }
  | { readonly kind: 'redispatch' }
  /** The owner's answer to the character's question: the same attempt goes on in a fresh session (§2.5). */
  | { readonly kind: 'answer'; readonly answer: string }
  /** The pool's mana came back: the paused attempt goes on, with the same character (§3.5). */
  | { readonly kind: 'wake' };

/** Openings that go on with the attempt in progress rather than start a new one (§2.5: same run `n`). */
const goesOn = (opening: Opening): boolean => opening.kind === 'answer' || opening.kind === 'wake';

const sameRun = (quest: Quest, opening: Opening): boolean =>
  goesOn(opening) || (opening.kind === 'redispatch' && goesOnInRun(quest.attempt_log));

async function continuationFor(ctx: Context, quest: Quest, opening: Opening): Promise<Continuation | null> {
  // The decision on an amendment ends a wait that may have begun with the run's work refused (fix/session-notes).
  if (opening.kind === 'answer' && quest.blocked?.amendment !== undefined)
    return { reason: 'revive', ...(await refusedWhileWaiting(ctx, quest)) };
  if (sameRun(quest, opening)) return { reason: 'revive' };
  // A start after earlier runs (the owner gave the quest to someone new) goes on from the letter, like a revival.
  if (opening.kind === 'start' && currentRun(quest) === 0) return null;
  return continuationOf(ctx, quest);
}

/** What the assignee of a start reads of the runs before (claim-prompt-size.ts measures it before the claim). */
export const startContinuationOf = (ctx: Context, quest: Quest): Promise<Continuation | null> =>
  continuationFor(ctx, quest, { kind: 'start' });

function eventOf(opening: Opening, session_id: string): MovePayload {
  if (opening.kind === 'answer') return { type: 'answer', answer: opening.answer, session_id };
  if (opening.kind === 'wake') return { type: 'mana_restored', session_id };
  return { type: opening.kind, session_id };
}

const ACTORS = { answer: 'user', wake: 'mana', start: 'steward', redispatch: 'steward' } as const;

/** CLI resume after an answer or mana, only when allowed by ADR 0017 and the tribe (§3.14). */
function resumeFor(ctx: Context, quest: Quest, character: Character, opening: Opening): Resume | null {
  if (!goesOn(opening)) return null;
  const canResume = ctx.limits[character.tribe]?.resume ?? false;
  const revival =
    opening.kind === 'answer' ? { kind: 'answer', now: ctx.deps.clock.now() } : { kind: 'mana' };
  const session = resumedSession(quest, revival as Revival, ctx.world.kingdom.dispatch, canResume);
  if (session === null) return null;
  const question = quest.blocked?.question;
  // An amendment's decision (PS-22b) says what it decided; an accepted one, the description the session never read.
  const amendment = quest.blocked?.amendment;
  const decided = amendment === undefined ? {} : { amendment, description: quest.description };
  const answered =
    opening.kind === 'answer' && question !== undefined
      ? { question, answer: opening.answer, ...decided }
      : null;
  return { session_id: session, answered };
}

/** The prompt of an answered question reads the answer from the quest (§2.4). */
const questSeen = (quest: Quest, opening: Opening): Quest =>
  opening.kind === 'answer' && quest.blocked !== undefined
    ? { ...quest, blocked: { ...quest.blocked, answer: opening.answer } }
    : quest;

const openingFor = (quest: Quest, opening: Opening): Opening =>
  opening.kind === 'start' && quest.status === 'returned' && endedInCut(quest.attempt_log)
    ? { kind: 'redispatch' }
    : opening;

/** Opens the assignee, including a returned ceiling cut listed among the plan's starts (ADR 0030). */
export async function openAssignee(
  ctx: Context,
  questId: QuestId,
  requested: Opening,
): Promise<Result<Quest, string>> {
  const parts = partsOf(ctx, questId, ctx.world.quests.get(questId)?.assignee);
  if (!parts.ok) return parts;
  const { quest, character, territory, runner } = parts.value;
  const opening = openingFor(quest, requested);
  const lacking = await secretsLacking(ctx, quest, territory);
  if (lacking !== undefined) {
    // A blocked quest has no way to the infirmary: the answer is refused with the reason.
    if (opening.kind === 'answer') return err(`secrets_lacking: ${lacking.code}`);
    return secretsBreaker(ctx, quest, lacking);
  }
  const n = currentRun(quest) + (sameRun(quest, opening) ? 0 : 1);
  await clearWrapUp(ctx, quest, n);
  const spawned = await spawnFor(
    ctx,
    runner,
    {
      role: 'assignee',
      quest: questSeen(quest, opening),
      character,
      territory,
      n,
      continuation: await continuationFor(ctx, quest, opening),
    },
    resumeFor(ctx, quest, character, opening),
  );
  if (!spawned.ok) return assigneeUnopened(ctx, quest, opening.kind, spawned.error);
  const { session, plot, spawned_at: spawnedAt, load_trace: loadTrace, head, advisories } = spawned.value;
  const sessionId = await session.session_id;
  const moved = await ctx.record.move({
    quest: questId,
    event: eventOf(opening, sessionId),
    actor: ACTORS[opening.kind],
    edits: { [character.id]: opening.kind === 'wake' ? step('mana_restored') : step('claim', questId) },
    before: { plot },
    load_trace: loadTrace,
  });
  if (!moved.ok) {
    await session.kill(`the quest refused ${opening.kind}: ${moved.error}`);
    return moved;
  }
  keep(ctx, {
    quest: questId,
    role: 'assignee',
    n,
    character: character.id,
    model: character.model,
    session,
    session_id: sessionId,
    checks: [],
    spawned_at: spawnedAt,
    ...(head === undefined ? {} : { head }),
  });
  await deliverAdvisories(ctx, questId, n, advisories); // read once the quest moved, so the session runs (PS-09c)
  return moved;
}

/**
 * The verifier's fresh session on a submitted quest (§3.2): the machine checks ran first, outside the tick (P1-25),
 * then the judge reads the letter, the checks and the work in the plot, never a transcript. A judge of tests as the
 * product opens in the scratch plot where they ran (ADR 0022). A judge whose session cannot open leaves the review
 * (judgeUnopened).
 */
export async function openVerifier(
  ctx: Context,
  questId: QuestId,
  verifierId: CharacterId,
): Promise<Result<Quest, string>> {
  const parts = partsOf(ctx, questId, verifierId);
  if (!parts.ok) return parts;
  const { quest, character, territory, runner } = parts.value;
  // The judge runs the same checks as the assignee, with the same secrets (§3.9).
  const lacking = await secretsLacking(ctx, quest, territory);
  if (lacking !== undefined) return secretsBreaker(ctx, quest, lacking);
  const n = currentRun(quest);
  const scratch = inScratch(ctx, quest);
  // Failing checks fail the quest whatever its judge says (underPassRule): the judge reads their logs, runs none of
  // the exclusive checks and waits for no lock (P1-54; P1-50 report §7: 9 to 33 minutes for a judge of 11–34 s).
  const exclusive = ctx.background.ended(questId, n)?.checks.every(({ pass }) => pass) !== false;
  // A judge in its scratch plot runs the exclusive checks too: it waits, its checks kept, until it holds their lock.
  if (scratch && exclusive && !(await judgeMayOpen(ctx, quest, territory))) return ok(quest);
  const checks = await takeChecks(ctx, quest);
  if (!checks.ok) return checks;
  const input = {
    role: 'verifier',
    quest,
    character,
    territory,
    n,
    checks: checks.value,
    scratch,
    exclusive,
  } as const;
  const parse = judgeParseOf(ctx, quest, character, { n, checks: checks.value });
  const opened = await spawnFor(ctx, runner, input, null, parse);
  if (!opened.ok) return judgeUnopened(ctx, quest, character.id, opened.error);
  const { session, spawned_at: spawnedAt, load_trace: loadTrace } = opened.value;
  const sessionId = await session.session_id;
  const moved = await ctx.record.move({
    quest: questId,
    event: { type: 'assign_verifier', verifier: character.id, session_id: sessionId },
    actor: 'steward',
    edits: { [character.id]: step('assign_verify', questId) },
    before: { checks_run: checksRunOf(checks.value) },
    load_trace: loadTrace,
  });
  if (!moved.ok) {
    await session.kill(`the quest refused its verifier: ${moved.error}`);
    return moved;
  }
  keep(ctx, {
    quest: questId,
    role: 'verifier',
    n,
    character: character.id,
    model: character.model,
    session,
    session_id: sessionId,
    checks: checks.value,
    spawned_at: spawnedAt,
  });
  return moved;
}
