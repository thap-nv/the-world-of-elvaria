// The owner's commands on characters (implementation-plan §2.6): `suspend` takes a character off work from any
// status but suspended, `release` brings a suspended one back idle. The quest goes on without the character (§2.5):
// returned when it was the assignee, back in review without a verifier when it was the verifier, open again when it
// was only claimed for it or the character slept on it paused for mana (P1-22). The roster never counts a suspended character, so planTick gives it nothing (P1-26).
import { findTransition } from '@elvaria/domain';
import { plotCommitMessage } from '@elvaria/runner-core';
import type { Character, CharacterId, Quest, RunEnd } from '@elvaria/domain';

import { moveAndRing } from '../notices.ts';
import { OWNER, step } from '../record.ts';
import { runOf } from '../review/judge.ts';
import { commitPlot } from '../sessions/commit.ts';
import { maskFinished } from '../sessions/secrets.ts';
import { APPLIED, rejected } from './quest-commands.ts';
import type { Context } from '../context.ts';
import type { Outcome } from './quest-commands.ts';

/** The quest the character works or judges, while that quest still has it in that role and may be suspended. */
function heldQuest(ctx: Context, character: Character): Quest | undefined {
  const held = character.current ?? undefined;
  const quest = held === undefined ? undefined : ctx.world.quests.get(held.quest);
  if (held === undefined || quest === undefined) return undefined;
  const holder = held.role === 'assignee' ? quest.assignee : quest.verifier;
  return holder === character.id && findTransition(quest, 'suspend').ok ? quest : undefined;
}

/**
 * Ends the session on `quest`, if this Steward holds one: its tree killed, what it left masked (§3.9), and an
 * assignee's work committed as WIP for whoever takes the quest next (§3.3), never past the territory's hooks.
 */
async function stopSession(ctx: Context, quest: Quest, why: string): Promise<RunEnd> {
  const running = ctx.sessions.get(quest.id);
  if (running === undefined) return {};
  const { result } = await maskFinished(ctx, { running, result: await ctx.sessions.stop(running, why) });
  if (running.role === 'assignee') {
    const wip = await commitPlot(ctx, quest.id, plotCommitMessage.wip(quest.id, 'suspend'));
    if (wip.status === 'refused')
      ctx.deps.log.warn(`steward: ${quest.id}: WIP not committed, it stays in the plot: ${wip.detail}`);
  }
  return runOf(running, result);
}

/**
 * Claims made for the character that never started (an owner's reassign waiting on its dependencies): there is no
 * row to give them to someone else from `claimed`, so they open again for the Steward's next choice (§2.5
 * `claimed.release`).
 */
async function releaseClaims(ctx: Context, id: CharacterId): Promise<void> {
  const claimed = [...ctx.world.quests.values()].filter(
    (quest) => quest.status === 'claimed' && quest.assignee === id,
  );
  for (const quest of claimed) {
    const moved = await moveAndRing(ctx, { quest: quest.id, event: { type: 'release' }, actor: 'steward' });
    if (!moved.ok) ctx.deps.log.warn(`steward: ${quest.id}: the claim for ${id} stays: ${moved.error}`);
  }
}

/** The quest's suspend row (§2.5), after its session: the character moves with it. */
async function suspendWith(ctx: Context, id: CharacterId, quest: Quest, why: string) {
  const run = await stopSession(ctx, quest, why);
  return moveAndRing(ctx, {
    quest: quest.id,
    event: { type: 'suspend', ...run },
    actor: 'user',
    edits: { [id]: step('suspend') },
  });
}

/**
 * `suspend`: the character's own move (§2.6), with its quest's when it works, judges or sleeps on one: a quest it
 * sleeps on (paused for mana) lets go of it and opens again (`paused_mana.suspend`, P1-22).
 */
export async function suspend(ctx: Context, id: CharacterId, reason: string | undefined): Promise<Outcome> {
  const character = ctx.world.characters.get(id);
  if (character === undefined) return rejected('unknown_character');
  if (character.status === 'suspended') return rejected('character_suspended');
  const quest = heldQuest(ctx, character);
  const why = `the owner suspended ${id}${reason === undefined ? '' : `: ${reason}`}`;
  const suspended =
    quest === undefined
      ? await ctx.record.change(id, 'character.suspend', step('suspend'), OWNER)
      : await suspendWith(ctx, id, quest, why);
  if (!suspended.ok) return rejected(suspended.error);
  await releaseClaims(ctx, id);
  return APPLIED;
}

/** `release`: a suspended character is idle again and takes work; its fail streak starts over (§2.6). */
export async function release(ctx: Context, id: CharacterId): Promise<Outcome> {
  const character = ctx.world.characters.get(id);
  if (character === undefined) return rejected('unknown_character');
  if (character.status !== 'suspended') return rejected('not_suspended');
  const released = await ctx.record.change(id, 'character.release', step('release'), OWNER);
  return released.ok ? APPLIED : rejected(released.error);
}
