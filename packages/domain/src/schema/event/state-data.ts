// `data` of the events that change what the world shows (implementation-plan §2.3, §8 P0-09). Each one states
// the view after the change instead of the change itself, so the reducer (domain/src/world/reduce.ts) needs no
// copy of the state machines, a missed line costs nothing once the next event of that quest arrives, and the
// snapshot can always be rebuilt from the log (ADR 0003, ADR 0004).
import { z } from 'zod';

import {
  CharacterIdSchema,
  ClassIdSchema,
  QuestIdSchema,
  REGISTRY_ID_PATTERN,
  SCRIPT_ID_PATTERN,
  TribeIdSchema,
} from '../../core/ids.ts';
import { INFIRMARY_TRIPS } from '../../quest/events.ts';
import { DateTimeSchema, NonEmptyStringSchema, RANKS } from '../common.ts';
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

/**
 * The parts of an infirmary reason (P1-32), each a piece the Steward used to write into `reason` alone. All optional:
 * a trip says only what it knows.
 */
export const InfirmaryDetailSchema = z
  .strictObject({
    message: NonEmptyStringSchema.optional().meta(
      describe(
        "What stopped the run, as the breaker, the territory's hook, the treasury or the script said it (not translated).",
      ),
    ),
    patch: NonEmptyStringSchema.optional().meta(
      describe(
        "trip commit: why the Steward refused the assignee's patch for laws.patch_paths (P1-28); the next run's prompt reads it back (P1-31).",
      ),
    ),
    wip: NonEmptyStringSchema.optional().meta(
      describe("Why the WIP commit after the breaker was refused: the work stays in the quest's plot."),
    ),
    apprentice_left: z
      .literal(true)
      .optional()
      .meta(
        describe(
          'An apprentice of the session ran past its minutes or was cut at its turns: its work left belongs in a child quest (§3.12).',
        ),
      ),
    script: z
      .string()
      .regex(SCRIPT_ID_PATTERN)
      .optional()
      .meta(describe('A script-tier quest: the catalog script that ran.')),
    follow_up: QuestIdSchema.optional().meta(
      describe('trip script_fail: the follow-up quest the catalog entry opened for the failed run (P1-17).'),
    ),
    verifiers_stopped: z
      .int()
      .min(1)
      .optional()
      .meta(
        describe(
          'This many verifiers of the run (the envelope `attempt`) left without a verdict, stopped by a breaker (P1-23) or with no verdict in their output (P1-33), so no further one opens.',
        ),
      ),
  })
  .meta(describe('Absent when the trip says it all (max_attempts).'));

export const QuestInfirmaryDataSchema = z.strictObject({
  reason: NonEmptyStringSchema.meta(
    describe(
      'The whole reason in one English line, for the bell and the chronicle, e.g. breaker:time: <detail>, max_attempts, script:broken: <detail>. Built from trip and detail since P1-32.',
    ),
  ),
  // Optional and added after v1 (P1-32): every line written before them has the reason alone, so `v` stays 1.
  trip: z
    .enum(INFIRMARY_TRIPS)
    .optional()
    .meta(
      describe(
        'What sent the quest there: a breaker (time, tokens, turns, commit, secrets), a review whose judges left without a verdict (no_verdict, P1-33), max_attempts, or a script-tier run (script_broken, script_usage, script_fail). Absent on lines written before P1-32.',
      ),
    ),
  detail: InfirmaryDetailSchema.optional(),
  ...QUEST_CHANGE,
});

export type InfirmaryDetail = z.infer<typeof InfirmaryDetailSchema>;

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

// Optional and added after v1 (P1-32): a line written before it, or a sleep whose reset nobody named, has none.
export const ManaExhaustedDataSchema = z
  .strictObject({
    ...ManaPoolDataSchema.shape,
    resets_at: DateTimeSchema.optional().meta(
      describe(
        'When the spent window resets, as the usage limit or the reading that put the gauge to sleep named it; the Steward probes just after (implementation-plan §3.5, P1-32).',
      ),
    ),
  })
  .meta(describe('The gauge that fell asleep: the whole pool, or the cap of one model (ADR 0009).'));
