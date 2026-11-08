// `data` of the events that change what the world shows (implementation-plan §2.3, §8 P0-09). Each one states
// the view after the change instead of the change itself, so the reducer (domain/src/world/reduce.ts) needs no
// copy of the state machines, a missed line costs nothing once the next event of that quest arrives, and the
// snapshot can always be rebuilt from the log (ADR 0003, ADR 0004).
import { z } from 'zod';

import { CharacterIdSchema, ClassIdSchema, REGISTRY_ID_PATTERN, TribeIdSchema } from '../../core/ids.ts';
import { NonEmptyStringSchema, RANKS } from '../common.ts';
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

/**
 * An open quest no character may take (implementation-plan §3.1 "Quest không ai nhận được", P1-03): written once
 * when the reason appears or changes, and with `reason: null` once it is gone while the quest is still open.
 * The quest itself does not change, so the data carries the reason, not the quest's view.
 */
export const QuestUnclaimableDataSchema = z
  .strictObject({
    reason: z
      .enum(['no_class', 'level_too_low'])
      .nullable()
      .meta(
        describe(
          'no_class: no character of the class outside the suspended ones and the disabled tribes; level_too_low: even the highest level among them cannot take the rank, not even when nobody else could (canTake); null: the reason is gone.',
        ),
      ),
    // RANKS, not RankSchema: its id would put a `$ref` into this rule, which is converted on its own (event-data.ts).
    rank: z.enum(RANKS),
    class: ClassIdSchema.meta(describe("The quest's class_required.")),
    best_character: CharacterIdSchema.optional().meta(
      describe('level_too_low: the highest-level character of the class.'),
    ),
    best_level: z.int().min(1).optional(),
  })
  .meta(describe('The quest stays open: a character who can take it later claims it as usual.'));

export const CharacterChangeDataSchema = z.strictObject({
  character: CharacterViewSchema.meta(describe('The character after this event (characterViewOf).')),
});

export const TerritoryChangeDataSchema = z.strictObject({
  territory: TerritoryViewSchema.meta(describe('The territory after this event (territoryViewOf).')),
});

export const ManaPoolDataSchema = z
  .strictObject({
    tribe: TribeIdSchema,
    pool: z.string().regex(REGISTRY_ID_PATTERN),
    // Optional and added after v1 (P1-22): every line written before it is a whole pool, so `v` stays 1.
    model: z
      .string()
      .regex(REGISTRY_ID_PATTERN)
      .optional()
      .meta(
        describe(
          "The one model whose own cap fell asleep or woke (argon, fable): only the characters on that model; absent for the whole pool (implementation-plan §3.5, P1-22). The pool's HUD band does not follow it.",
        ),
      ),
  })
  .meta(
    describe(
      'The gauge that fell asleep (mana.exhausted) or woke (mana.restored): the whole pool, every character of it, or the cap of one model (ADR 0009).',
    ),
  );
