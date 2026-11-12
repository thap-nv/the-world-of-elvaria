// Opening a session (implementation-plan §3.1 steps 4–6, §2.5): the plot, the request, the spawn, then the quest's
// move with the session's id and the character's move with it. A move the state machine refuses kills the session
// it was for, so no session ever runs for a quest the files do not say it runs for.
import { currentRun, err, ok, resumedSession } from '@elvaria/domain';
import { resumedPrompt } from '@elvaria/runner-core';
import type { Character, CharacterId, Quest, QuestId, Result, Revival } from '@elvaria/domain';
import type {
  AgentRunner,
  Answered,
  Continuation,
  ParseOptions,
  RunningSession,
  SpawnRequest,
} from '@elvaria/runner-core';

import { heardBy } from '../mana/heard.ts';
import { mergeParts, plotOptionsOf } from '../party/plot.ts';
import { step } from '../record.ts';
import { checksRunOf, takeChecks } from '../review/checks.ts';
import { inScratch, judgeMayOpen } from '../review/scratch.ts';
import { judgeParseOf } from '../review/verdict-file.ts';
import { secretsBreaker } from './breaker.ts';
import { continuationOf, requestOf } from './request.ts';
import { questSecretsOf, rememberSecrets, secretsLacking } from './secrets.ts';
import { spawnOf } from './spawn.ts';
import type { Context } from '../context.ts';
import type { MovePayload } from '../record.ts';
import type { SessionInput } from './request.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

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

/** A CLI session to continue (`--resume`), and the answer it gets when the owner answered its question. */
interface Resume {
  readonly session_id: string;
  readonly answered: Answered | null;
}

/** The request of a resumed session: `--resume`, and a prompt carrying only what is new (ADR 0017). */
const resumedRequest = (ctx: Context, request: SpawnRequest, resume: Resume | null): SpawnRequest =>
  resume === null
    ? request
    : {
        ...request,
        resume: { session_id: resume.session_id },
        prompt: resumedPrompt(request.prompt, resume.answered, ctx.templates),
      };

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
  if (input.role === 'assignee') await mergeParts(ctx, input.quest, prepared.plot);
  return prepared;
}

/**
 * Prepares the plot, builds the request and spawns as the tribe's limits ask (spawnOf, P1-33); the session and the
 * plot the quest gets. `resume` continues that CLI session (ADR 0017); the session's in-band mana windows are heard
 * by the gauge (§3.5).
 */
async function spawnFor(
  ctx: Context,
  runner: AgentRunner,
  input: Omit<SessionInput, 'cwd'>,
  resume: Resume | null = null,
  parse?: ParseOptions,
): Promise<Result<{ session: RunningSession; plot: Quest['plot']; spawned_at: string }, string>> {
  try {
    const prepared = await plotFor(ctx, input);
    const quest = { ...input.quest, plot: prepared.plot };
    const request = await requestOf(ctx, { ...input, quest, cwd: prepared.cwd });
    const resumed = resumedRequest(ctx, request, resume);
    const session = heardBy(ctx.mana, input.character, await spawnOf(ctx, runner, resumed, parse));
    // Right after the spawn: a restart tells the CLI's process by its start (sessions/pids.ts).
    const spawnedAt = ctx.record.stamp();
    // Keyed by the session the Steward keeps (heardBy's wrapper): maskFinished finds it from Running.session.
    rememberSecrets(session, resumed);
    return ok({ session, plot: prepared.plot, spawned_at: spawnedAt });
  } catch (error) {
    ctx.deps.log.warn(
      `steward: ${input.quest.id}: no session for ${input.character.id}: ${messageOf(error)}`,
    );
    return err('spawn_failed');
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

async function continuationFor(ctx: Context, quest: Quest, opening: Opening): Promise<Continuation | null> {
  if (goesOn(opening)) return { reason: 'revive' };
  // A start after earlier runs (the owner gave the quest to someone new) goes on from the letter, like a revival.
  if (opening.kind === 'start' && currentRun(quest) === 0) return null;
  return continuationOf(ctx, quest);
}

function eventOf(opening: Opening, session_id: string): MovePayload {
  if (opening.kind === 'answer') return { type: 'answer', answer: opening.answer, session_id };
  if (opening.kind === 'wake') return { type: 'mana_restored', session_id };
  return { type: opening.kind, session_id };
}

const ACTORS = { answer: 'user', wake: 'mana', start: 'steward', redispatch: 'steward' } as const;

/**
 * The CLI session to continue (`--resume`) instead of a fresh one from the letter (ADR 0017): after an answer in
 * time, or after mana with resume_after_mana, and only when the tribe's adapter can resume (§3.14).
 */
function resumeFor(ctx: Context, quest: Quest, character: Character, opening: Opening): Resume | null {
  if (!goesOn(opening)) return null;
  const canResume = ctx.limits[character.tribe]?.resume ?? false;
  const revival =
    opening.kind === 'answer' ? { kind: 'answer', now: ctx.deps.clock.now() } : { kind: 'mana' };
  const session = resumedSession(quest, revival as Revival, ctx.world.kingdom.dispatch, canResume);
  if (session === null) return null;
  const question = quest.blocked?.question;
  const answered =
    opening.kind === 'answer' && question !== undefined ? { question, answer: opening.answer } : null;
  return { session_id: session, answered };
}

/** The prompt of an answered question reads the answer from the quest (§2.4). */
const questSeen = (quest: Quest, opening: Opening): Quest =>
  opening.kind === 'answer' && quest.blocked !== undefined
    ? { ...quest, blocked: { ...quest.blocked, answer: opening.answer } }
    : quest;

/**
 * The assignee's session on `questId`: a start (claimed → working), a redispatch (returned → working), the
 * owner's answer (blocked → working) or the pool's mana back (paused_mana → working, the sleeper wakes into it).
 * A start that cannot spawn releases the claim (§2.5 `claimed.release`).
 */
export async function openAssignee(
  ctx: Context,
  questId: QuestId,
  opening: Opening,
): Promise<Result<Quest, string>> {
  const parts = partsOf(ctx, questId, ctx.world.quests.get(questId)?.assignee);
  if (!parts.ok) return parts;
  const { quest, character, territory, runner } = parts.value;
  const lacking = await secretsLacking(ctx, quest, territory);
  if (lacking !== undefined) {
    // A blocked quest has no way to the infirmary: the owner's answer is refused with the reason instead.
    if (opening.kind === 'answer') return err(`secrets_lacking: ${lacking}`);
    return secretsBreaker(ctx, quest, lacking);
  }
  const n = goesOn(opening) ? currentRun(quest) : currentRun(quest) + 1;
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
  if (!spawned.ok) {
    if (opening.kind === 'start')
      await ctx.record.move({ quest: questId, event: { type: 'release' }, actor: 'steward' });
    return spawned;
  }
  const { session, plot, spawned_at: spawnedAt } = spawned.value;
  const sessionId = await session.session_id;
  const moved = await ctx.record.move({
    quest: questId,
    event: eventOf(opening, sessionId),
    actor: ACTORS[opening.kind],
    edits: { [character.id]: opening.kind === 'wake' ? step('mana_restored') : step('claim', questId) },
    before: { plot },
  });
  if (!moved.ok) {
    await session.kill(`the quest refused ${opening.kind}: ${moved.error}`);
    return moved;
  }
  ctx.sessions.add({
    quest: questId,
    role: 'assignee',
    n,
    character: character.id,
    model: character.model,
    session,
    session_id: sessionId,
    checks: [],
    spawned_at: spawnedAt,
  });
  ctx.counts.started += 1;
  return moved;
}

/**
 * The verifier's fresh session on a submitted quest (§3.2): the machine checks ran first, outside the tick (P1-25),
 * then the judge reads the letter, the checks and the work in the plot, never a transcript. A judge of tests as the
 * product opens in the scratch plot where they ran (ADR 0022).
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
  if (!opened.ok) return opened;
  const { session, spawned_at: spawnedAt } = opened.value;
  const sessionId = await session.session_id;
  const moved = await ctx.record.move({
    quest: questId,
    event: { type: 'assign_verifier', verifier: character.id, session_id: sessionId },
    actor: 'steward',
    edits: { [character.id]: step('assign_verify', questId) },
    before: { checks_run: checksRunOf(checks.value) },
  });
  if (!moved.ok) {
    await session.kill(`the quest refused its verifier: ${moved.error}`);
    return moved;
  }
  ctx.sessions.add({
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
  ctx.counts.started += 1;
  return moved;
}
