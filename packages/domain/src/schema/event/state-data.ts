// `data` of the events that change what the world shows (implementation-plan §2.3, §8 P0-09). Each one states
// the view after the change instead of the change itself, so the reducer (domain/src/world/reduce.ts) needs no
// copy of the state machines, a missed line costs nothing once the next event of that quest arrives, and the
// snapshot can always be rebuilt from the log (ADR 0003, ADR 0004).
import { z } from 'zod';

import { REGISTRY_ID_PATTERN, TribeIdSchema } from '../../core/ids.ts';
import { NonEmptyStringSchema } from '../common.ts';
import { CharacterViewSchema } from '../../world/character-view.ts';
import { QuestViewSchema } from '../../world/quest-view.ts';
import { TerritoryViewSchema } from '../../world/territory-view.ts';

const describe = (description: string) => ({ description });

const QUEST_CHANGE = {
  quest: QuestViewSchema.meta(
    describe('The quest after this event (questViewOf). Its id is the envelope `quest`.'),
  ),
  characters: z
    .array(CharacterViewSchema)
    .optional()
    .meta(
      describe(
        'Characters the same step moved (characterViewOf after it): the assignee that claims or submits, the verifier that takes the review. Most character moves have no character.* type of their own.',
      ),
    ),
};

export const QuestChangeDataSchema = z.strictObject(QUEST_CHANGE);

export const QuestInfirmaryDataSchema = z.strictObject({
  reason: NonEmptyStringSchema.meta(
    describe('e.g. breaker:time, breaker:tokens, max_attempts, script_error.'),
  ),
  ...QUEST_CHANGE,
});

export const CharacterChangeDataSchema = z.strictObject({
  character: CharacterViewSchema.meta(describe('The character after this event (characterViewOf).')),
});

export const TerritoryChangeDataSchema = z.strictObject({
  territory: TerritoryViewSchema.meta(describe('The territory after this event (territoryViewOf).')),
});

export const ManaPoolDataSchema = z
  .strictObject({ tribe: TribeIdSchema, pool: z.string().regex(REGISTRY_ID_PATTERN) })
  .meta(
    describe(
      'The pool that fell asleep (mana.exhausted) or woke (mana.restored): the whole pool, every character of it (ADR 0009).',
    ),
  );
