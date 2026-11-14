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
import { INFIRMARY_REASONS, INFIRMARY_REASON_PARAMS } from '../../infirmary/reasons.ts';
import { DateTimeSchema, NonEmptyStringSchema, RANKS } from '../common.ts';
import { CharacterViewSchema } from '../../world/character-view.ts';
import { QuestViewSchema } from '../../world/quest-view.ts';
import { TerritoryViewSchema } from '../../world/territory-view.ts';
import { LoadTraceSchema } from './load-trace.ts';

const describe = (description: string) => ({ description });

/** A session that followed the first in the same run (RunEnd.sequels, P1-49). */
const SequelRunSchema = z.strictObject({
  session_id: NonEmptyStringSchema.optional().meta(
    describe("The sequel's CLI session, when the runner knew it."),
  ),
  why: NonEmptyStringSchema.optional().meta(
    describe('Why it opened: the reply tried once more, the letter unchanged (not translated).'),
  ),
});

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
  // Optional and added after v1 (P1-49): a line written before it, or of a run without sequels, has none.
  sequels: z
    .array(SequelRunSchema)
    .min(1)
    .optional()
    .meta(
      describe(
        "The line that tells a session's end: the sessions that followed the first in the same run (a reply tried once more for a tribe without structured output, a reminder of an unchanged letter, P1-33), in order. The envelope `session` is the first one's, and attempt_log has one entry for them all, so the log counts every session a run opened (P1-49).",
      ),
    ),
  // Optional and added after v1 (PS-01b), as `sequels`: a line written before it, or no opening line, has none.
  load_trace: LoadTraceSchema.optional(),
  // Optional and added after v1 (PS-05), as `sequels`: a line written before it, or of work that stayed inside its
  // scope, has none.
  out_of_scope: z
    .array(NonEmptyStringSchema)
    .min(1)
    .optional()
    .meta(
      describe(
        "On the `quest.submitted` line of a quest with scope_paths: the files the work changed outside them, the territory's shared paths aside, relative to the plot with `/`. A signal for the judge, who sees the same list, and a number in the metrics; never a fail (ADR 0028).",
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
        'Verbatim external text from a script or hook, never a sentence composed by Elvaria; Elvaria explains the cause through reason.',
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
    paths: z
      .array(NonEmptyStringSchema)
      .min(1)
      .optional()
      .meta(
        describe(
          "trip forbidden_paths: the paths of laws.forbidden_paths the session left changed, added or deleted in the quest's plot, relative to it with `/` (P1-49). Nothing was committed: the work stays in the plot.",
        ),
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
    partial_verdicts: z
      .int()
      .min(1)
      .optional()
      .meta(
        describe(
          'trip partial_verdicts: this many judges of the run (the envelope `attempt`) handed in a partial verdict since the owner last retried the review, so no further one opens (P1-42).',
        ),
      ),
  })
  .meta(describe('Absent when the trip says it all (max_attempts).'));

export const InfirmaryReasonSchema = z
  .strictObject({
    code: z.enum(INFIRMARY_REASONS),
    params: z.record(z.string(), z.union([z.string(), z.int()])),
  })
  .refine(
    ({ code, params }) => {
      const required = INFIRMARY_REASON_PARAMS[code];
      const keys = Object.keys(params);
      return keys.length === required.length && required.every((key) => Object.hasOwn(params, key));
    },
    { path: ['params'], message: 'params must have exactly the keys declared for code' },
  );

export const QuestInfirmaryDataSchema = z.strictObject({
  reason: InfirmaryReasonSchema.meta(
    describe(
      'A stable reason code and its exact parameter keys, rendered in the owner’s language. Migrated v1 reasons use legacy with the original text unchanged.',
    ),
  ),
  // Optional since P1-32: migrated lines written before it still have the reason alone.
  trip: z
    .enum(INFIRMARY_TRIPS)
    .optional()
    .meta(
      describe(
        'What sent the quest there: a breaker (time, tokens, turns, commit, secrets, forbidden_paths), a review whose judges left without a verdict (no_verdict, P1-33) or kept handing in partial ones (partial_verdicts, P1-42), max_attempts, or a script-tier run (script_broken, script_usage, script_fail). Absent on lines written before P1-32.',
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
      .enum(['no_class', 'level_too_low', 'party_bars'])
      .nullable()
      .meta(
        describe(
          "no_class: no character of the class outside the suspended ones and the disabled tribes; level_too_low: even the highest level among them cannot take the rank, not even when nobody else could (canTake); party_bars: every one of them is barred by the quest's party, having judged one of its quests or worked the other side of its blind trial (partyBarsOf, P1-37); null: the reason is gone.",
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
