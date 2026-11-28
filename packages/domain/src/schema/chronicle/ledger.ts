// chronicle/<day>.json v1: the day's ledger (P2-06, phase-2-wave-1.md): what happened on one local day of the kingdom,
// as the machine read it from the event log. The chronicle's text is written from it and checked against it (ADR 0017:
// the machine builds the facts, a model only words them), so a fact missing here cannot be told.
import { z } from 'zod';

import { CharacterIdSchema, QuestIdSchema, TerritoryIdSchema, TribeIdSchema } from '../../core/ids.ts';
import { LOCAL_DAY_PATTERN } from '../../schedule/constants.ts';
import { DateTimeSchema, NameSchema } from '../common.ts';
import { QuestTitleSchema } from '../quest/shared.ts';

const describe = (description: string) => ({ description });

/**
 * What a ledger entry tells, one per event type the chronicle reads (LEDGER_TABLE): a quest done, returned, sealed,
 * sent to the infirmary, delivered, merged; a verdict passed or failed; a character up or down a level; a pool asleep
 * or awake.
 */
export const LEDGER_KINDS = [
  'quest_done',
  'quest_returned',
  'quest_sealed',
  'quest_infirmary',
  'quest_delivered',
  'quest_merged',
  'verdict_pass',
  'verdict_fail',
  'level_up',
  'level_down',
  'pool_asleep',
  'pool_awake',
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const CharacterRefSchema = z.strictObject({ id: CharacterIdSchema, name: NameSchema });
export type CharacterRef = z.infer<typeof CharacterRefSchema>;

export const LedgerEntrySchema = z.strictObject({
  at: DateTimeSchema.meta(describe("The event's time, as the log wrote it.")),
  kind: z.enum(LEDGER_KINDS),
  quest: QuestIdSchema.optional(),
  title: QuestTitleSchema.optional().meta(describe("The quest's title as the log last showed it.")),
  territory: TerritoryIdSchema.optional(),
  character: CharacterRefSchema.optional().meta(
    describe("The quest's assignee, or the character whose level moved."),
  ),
  by: CharacterRefSchema.optional().meta(
    describe("The character who acted, when another than `character`: a verdict's judge."),
  ),
  tribe: TribeIdSchema.optional(),
  pool: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const ChronicleLedgerSchema = z
  .strictObject({
    version: z.literal(1),
    day: z.string().regex(LOCAL_DAY_PATTERN).meta(describe("The kingdom's local day, yyyy-mm-dd.")),
    tz: z.string().min(1).meta(describe('kingdom.tz, whose day the entries fall on.')),
    entries: z.array(LedgerEntrySchema).meta(describe('In log order.')),
    counts: z.record(z.enum(LEDGER_KINDS), z.int().min(0)).meta(describe('Entries of each kind.')),
    quests: z.int().min(0).meta(describe('Distinct quests named by the entries.')),
    characters: z
      .array(CharacterRefSchema)
      .meta(
        describe(
          'The characters the entries name, in order of first mention: the only ones the chronicle may tell of that day.',
        ),
      ),
  })
  .meta({
    title: 'Chronicle ledger',
    description:
      "chronicle/YYYY-MM-DD.json in a kingdom: the facts of one local day, read from the event log by dayLedgerOf (P2-06). The Steward writes it once, with chronicle/YYYY-MM-DD.md, at kingdom.schedule.chronicle.at; the chronicle's prose is checked against it (checkChronicle).",
  });
export type ChronicleLedger = z.infer<typeof ChronicleLedgerSchema>;
