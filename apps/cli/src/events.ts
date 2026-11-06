// Events the CLI causes itself. It creates territories and characters without the Steward (ADR 0005, as amended
// for P0-08), so it also writes the line the world learns of them from: territory.* and character.* events carry
// the view after the change (P0-09), and the reducer puts it in place. P0-08 merged after P0-05, so it wires this
// (implementation-plan §8).
import { EventSchema, characterViewOf, territoryViewOf } from '@elvaria/domain';
import type { Character, Territory } from '@elvaria/domain';
import { createRedactor, openEventLog, redactDeep } from '@elvaria/eventlog';

import type { KingdomContext } from './kingdom-context.ts';

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
    v: 1,
    id: ctx.ids.ulid(),
    ts: ctx.now(),
    type: 'territory.attached',
    actor: OWNER,
    territory: territory.id,
    data: { territory: territoryViewOf(territory) },
  });
}

export function recordCharacterCreated(ctx: KingdomContext, character: Character): Promise<void> {
  return append(ctx, {
    v: 1,
    id: ctx.ids.ulid(),
    ts: ctx.now(),
    type: 'character.created',
    actor: OWNER,
    data: { character: characterViewOf(character) },
  });
}
