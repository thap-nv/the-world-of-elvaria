// inbox-command v1: inbox/<ulid>.json, one owner action waiting for the Steward (ADR 0005).
// A discriminated union on `kind`: zod picks the payload schema from the kind and TypeScript narrows `payload`
// the same way. The contract therefore lists one `oneOf` branch per kind where v1 wrote an if/then per kind;
// both accept exactly the same files, because every branch fixes `kind` to one value.
import { z } from 'zod';

import { UlidSchema } from '../../core/ids.ts';
import { DateTimeSchema, GENERATED_NOTE } from '../common.ts';
import {
  AnswerPayloadSchema,
  AttachTerritoryPayloadSchema,
  CharacterPayloadSchema,
  CharacterReasonPayloadSchema,
  CloseCampaignPayloadSchema,
  CreateQuestPayloadSchema,
  DeclareCampaignPayloadSchema,
  EditQuestPayloadSchema,
  PinTagPayloadSchema,
  QuestPayloadSchema,
  QuestReasonPayloadSchema,
  ReassignPayloadSchema,
  ReturnPayloadSchema,
  SealPayloadSchema,
  SetLevelPayloadSchema,
  SetModelPayloadSchema,
  SetRankPayloadSchema,
  WakePayloadSchema,
} from './payloads.ts';
import {
  DecideAmendmentPayloadSchema,
  DecideMemoPayloadSchema,
  EscalateMemoPayloadSchema,
} from './memo-payloads.ts';

/**
 * Who wrote the command: the owner's clients (CLI, Herald, the phone), or the Chancellor's triage (PS-03b), whose
 * commands the Steward applies without the owner within kingdom.delegation and tells as the Chancellor's.
 */
export const COMMAND_SOURCES = ['cli', 'herald', 'lite', 'chancellor'] as const;
const SourceSchema = z.enum(COMMAND_SOURCES);

/** One branch of the union: the common fields, in the contract's order, with `kind` fixed. */
const command = <K extends string, P extends z.ZodType>(kind: K, payload: P) =>
  z.strictObject({
    version: z.literal(1),
    id: UlidSchema,
    ts: DateTimeSchema,
    kind: z.literal(kind),
    source: SourceSchema,
    payload,
  });

// In the order of the v1 `kind` enum, so the contract reads like the glossary (§9); later kinds follow, each a
// compatible addition (ADR 0003): a writer that never sends one is unaffected.
export const InboxCommandSchema = z
  .discriminatedUnion('kind', [
    command('confirm', QuestPayloadSchema),
    command('seal', SealPayloadSchema),
    command('return', ReturnPayloadSchema),
    command('retry', QuestPayloadSchema),
    command('cancel', QuestReasonPayloadSchema),
    command('archive', QuestReasonPayloadSchema),
    command('summon', CharacterPayloadSchema),
    command('wake', WakePayloadSchema),
    command('suspend', CharacterReasonPayloadSchema),
    command('release', CharacterPayloadSchema),
    command('reassign', ReassignPayloadSchema),
    command('send_to_temple', CharacterPayloadSchema),
    command('declare_campaign', DeclareCampaignPayloadSchema),
    command('close_campaign', CloseCampaignPayloadSchema),
    command('create_quest', CreateQuestPayloadSchema),
    command('answer', AnswerPayloadSchema),
    command('set_rank', SetRankPayloadSchema),
    command('attach_territory', AttachTerritoryPayloadSchema),
    command('edit_quest', EditQuestPayloadSchema),
    command('pin_tag', PinTagPayloadSchema),
    command('set_level', SetLevelPayloadSchema),
    command('set_model', SetModelPayloadSchema),
    command('decide_memo', DecideMemoPayloadSchema),
    command('escalate_memo', EscalateMemoPayloadSchema),
    command('decide_amendment', DecideAmendmentPayloadSchema),
  ])
  .meta({
    title: 'Inbox command',
    description:
      "inbox/<ulid>.json: one command from the owner (CLI, Herald, lite phone client), or from the Chancellor's office (source = chancellor: its triage of memos, PS-03b; an amendment's author, PS-22b), waiting for the Steward, the single writer of quest state (ADR 0005). The Steward applies commands in id order at the start of every tick, appends command.applied or command.rejected, and moves the file to inbox/done/. Idempotent: a command id that already has a command.applied event is skipped. Kinds match the design's action icons (seal, return, summon, suspend, reassign, archive, temple, declare) plus the lifecycle commands the state machine needs.",
    $comment: `${GENERATED_NOTE} One oneOf branch per kind: each fixes \`kind\` and gives its payload. confirm (draft -> open) and edit_quest (\`elvaria quest edit\`) are additions to the plan's §2.3 list, required by the single-writer rule; pin_tag (pin a character to an expertise tag, product plan 0.5 §6) was added with plan 0.5; set_level (the owner sets a character's level) and create_quest's assignee with P1-29; set_model (the owner moves a character to another model of its tribe) with P1-22; decide_memo (the owner closes a memo) with PS-02; escalate_memo (the Chancellor's triage sends a memo to the owner), source = chancellor, and the memos of create_quest and edit_quest with PS-03b; decide_amendment (an amendment's author decided it, source = chancellor) with PS-22b. archive covers discard (draft), reject (awaiting_seal) and archive (done, infirmary); the Steward picks the transition from the quest's current status. edit_quest is rejected when the quest's updated_at differs from expected_updated_at.`,
  });

/** A parsed command; `switch (command.kind)` narrows `payload`. */
export type InboxCommand = z.infer<typeof InboxCommandSchema>;
/** What a writer (CLI, Herald, Chancellor) may put in the file: payload defaults may be left out. */
export type InboxCommandInput = z.input<typeof InboxCommandSchema>;
export type InboxCommandKind = InboxCommand['kind'];
export type InboxCommandOf<K extends InboxCommandKind> = Extract<InboxCommand, { kind: K }>;
export type CommandPayload<K extends InboxCommandKind> = InboxCommandOf<K>['payload'];
