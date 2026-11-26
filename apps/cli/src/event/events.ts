// Events the CLI causes itself. It creates territories and characters without the Steward (ADR 0005, as amended
// for P0-08), so it also writes the line the world learns of them from: territory.* and character.* events carry
// the view after the change (P0-09), and the reducer puts it in place. P0-08 merged after P0-05, so it wires this
// (implementation-plan §8).
import { EVENT_VERSION, EventSchema, characterViewOf, territoryViewOf } from '@elvaria/domain';
import type { Character, Event, EventData, Territory } from '@elvaria/domain';
import { createRedactor, openEventLog, redactDeep } from '@elvaria/eventlog';

import type { KingdomContext } from '../kingdom-context.ts';

/** The owner, through the CLI: the actor of every event the CLI writes. */
const OWNER = { kind: 'user' } as const;

async function append(ctx: KingdomContext, line: unknown): Promise<void> {
  // Checked before it is written: the log is never rewritten, so a malformed line would stay for good.
  const event = EventSchema.parse(line);
  // Views hold names, not secrets; masking anyway keeps "redact before append" without exceptions (ADR 0013).
  await openEventLog(ctx.store.root).append([redactDeep(event, createRedactor([]))]);
}

export function recordTerritoryAttached(ctx: KingdomContext, territory: Territory): Promise<void> {
  return append(ctx, {
    v: EVENT_VERSION,
    id: ctx.ids.ulid(),
    ts: ctx.now(),
    type: 'territory.attached',
    actor: OWNER,
    territory: territory.id,
    data: { territory: territoryViewOf(territory) },
  });
}

export type UpgradeEventType =
  'upgrade.started' | 'upgrade.switched' | 'upgrade.rolled_back' | 'upgrade.failed';

/** The build a kingdom runs (PS-04b): `elvaria upgrade` moves the pointer while no Steward runs, so it says so. */
export function recordUpgrade<T extends UpgradeEventType>(
  ctx: KingdomContext,
  type: T,
  data: EventData<T>,
): Promise<void> {
  return append(ctx, { v: EVENT_VERSION, id: ctx.ids.ulid(), ts: ctx.now(), type, actor: OWNER, data });
}

/** What a tribe check against the real CLI spent (run (221) (b)): the Steward's mana estimate counts it. */
export function recordTribeChecked(ctx: KingdomContext, data: EventData<'tribe.checked'>): Promise<void> {
  return append(ctx, {
    v: EVENT_VERSION,
    id: ctx.ids.ulid(),
    ts: ctx.now(),
    type: 'tribe.checked',
    actor: OWNER,
    data,
  });
}

/**
 * What a session of the Chancellor's office spent once it answered (fix/run-221-followups): the character who spoke is
 * the actor, and the Steward's mana estimate counts the tokens against the pool of its model, as a tribe check's.
 */
export function recordChancellorAnswered(
  ctx: KingdomContext,
  speaker: Pick<Character, 'id' | 'tribe' | 'model'>,
  spent: Pick<EventData<'chancellor.answered'>, 'matter' | 'tokens'>,
): Promise<void> {
  return append(ctx, {
    v: EVENT_VERSION,
    id: ctx.ids.ulid(),
    ts: ctx.now(),
    type: 'chancellor.answered',
    actor: { kind: 'character', id: speaker.id },
    data: { tribe: speaker.tribe, model: speaker.model, ...spent },
  });
}

/**
 * (PS-12f) One run of the Temple: the Monk who spoke is the actor when a session ran, else whoever ran it (the Steward's
 * job, or the owner's `elvaria temple run`). Written also when no model was called, so the count of judged runs starts
 * again; the Steward's mana estimate counts its tokens from its next start (ADR 0009).
 */
export function recordTempleRan(
  ctx: KingdomContext,
  actor: Event['actor'],
  data: EventData<'temple.ran'>,
): Promise<void> {
  return append(ctx, {
    v: EVENT_VERSION,
    id: ctx.ids.ulid(),
    ts: ctx.now(),
    type: 'temple.ran',
    actor,
    data,
  });
}

export function recordCharacterCreated(ctx: KingdomContext, character: Character): Promise<void> {
  return append(ctx, {
    v: EVENT_VERSION,
    id: ctx.ids.ulid(),
    ts: ctx.now(),
    type: 'character.created',
    actor: OWNER,
    data: { character: characterViewOf(character) },
  });
}
