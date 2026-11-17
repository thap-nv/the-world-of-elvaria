// memo v1: memos/<id>.json, one letter a character wrote in the Memos section of its handover letter (PS-02,
// implementation-plan §3.16.2, ADR 0024). The entity is `memo` because `letter` already names the handover letter in
// the code; display strings say letter. Only the Steward writes these files (ADR 0005).
import { z } from 'zod';

import {
  CharacterIdSchema,
  MemoIdSchema,
  MemoKindIdSchema,
  QuestIdSchema,
  VerdictIdSchema,
} from '../../core/ids.ts';
import { DELEGATION_HOLDS, TRIAGE_ACTIONS } from '../../delegation/constants.ts';
import { DateTimeSchema, GENERATED_NOTE, NonEmptyStringSchema, unique } from '../common.ts';
import {
  MEMO_BODY_MAX_LENGTH,
  MEMO_DELIVERY_OUTCOMES,
  MEMO_JUDGEMENTS,
  MEMO_OUTCOME_DECISIONS,
  TRIAGE_NOTE_MAX_LENGTH,
  MEMO_REF_MAX_LENGTH,
  MEMO_REFS_MAX,
  MEMO_REFUSALS,
  MEMO_ROUTES,
  MEMO_STATES,
} from './constants.ts';

const describe = (description: string) => ({ description });

export const MemoBodySchema = z.string().min(1).max(MEMO_BODY_MAX_LENGTH);
export const MemoRefsSchema = z
  .array(z.string().min(1).max(MEMO_REF_MAX_LENGTH))
  .max(MEMO_REFS_MAX)
  .meta(
    describe("Files the memo is about, relative to the plot, as the character wrote them ('/' separators)."),
  );

const MemoRouteFieldsSchema = z.strictObject({
  route: z
    .enum(MEMO_ROUTES)
    .meta(describe("Where the memo goes, from its kind's entry in registry/memos.json.")),
  verdict: VerdictIdSchema.optional().meta(
    describe(
      '(PS-22) Of an objection: the fail verdict it contests; absent when its run came back with none.',
    ),
  ),
  refusal: z
    .enum(MEMO_REFUSALS)
    .optional()
    .meta(
      describe(
        '(PS-22) Of an objection the owner decides: why no second judge reads it. (PS-22b) Of an amendment the owner decides: why no author does.',
      ),
    ),
  author: CharacterIdSchema.optional().meta(
    describe(
      "(PS-22b) Of an amendment its author decides: the mage whose plan quest wrote the quest's description; absent, the Chancellor (whichever speaks when it decides).",
    ),
  ),
  quests: unique(z.array(QuestIdSchema))
    .optional()
    .meta(
      describe(
        '(PS-09c) Of a memo to quests (an advisory): the quests it went to, each to read it once in its next assignee session.',
      ),
    ),
});

/**
 * A judge reads an objection beside the verdict it contests; only a memo sent to the owner says why (PS-22); only an
 * amendment to its author names a mage (PS-22b).
 */
function checkRoute(to: z.output<typeof MemoRouteFieldsSchema>, ctx: z.RefinementCtx): void {
  if (to.route === 'judge' && to.verdict === undefined)
    ctx.addIssue({ code: 'custom', path: ['verdict'], message: 'an objection to a judge names its verdict' });
  if (to.refusal !== undefined && to.route !== 'owner')
    ctx.addIssue({ code: 'custom', path: ['refusal'], message: 'only a memo to the owner is refused' });
  if (to.author !== undefined && to.route !== 'author')
    ctx.addIssue({ code: 'custom', path: ['author'], message: 'only a memo to its author names one' });
  if ((to.route === 'quests') !== (to.quests !== undefined))
    ctx.addIssue({
      code: 'custom',
      path: ['quests'],
      message: 'a memo to quests names them, and only such a memo',
    });
}

export const MemoRouteSchema = MemoRouteFieldsSchema.superRefine(checkRoute).meta({
  description:
    'The recipient, decided by routeMemo from the registry and, for a judge, from the verdict the run came back with (ADR 0024, PS-22), for an author from who wrote the quest (PS-22b), for quests from the quests at work whose scope meets its files (PS-09c).',
  allOf: [
    { if: { properties: { route: { const: 'judge' } } }, then: { required: ['verdict'] } },
    { if: { required: ['refusal'] }, then: { properties: { route: { const: 'owner' } } } },
    { if: { required: ['author'] }, then: { properties: { route: { const: 'author' } } } },
    { if: { properties: { route: { const: 'quests' } } }, then: { required: ['quests'] } },
    { if: { required: ['quests'] }, then: { properties: { route: { const: 'quests' } } } },
  ],
});
export type MemoRoute = z.infer<typeof MemoRouteSchema>;

export const MemoOutcomeSchema = z
  .strictObject({
    decision: z.enum(MEMO_OUTCOME_DECISIONS),
    at: DateTimeSchema,
    quest: QuestIdSchema.optional().meta(describe('With decision = handled: the quest that does the work.')),
    verdict: VerdictIdSchema.optional().meta(
      describe("(PS-22) With decision = sustained or overruled: the second judge's verdict."),
    ),
    note: NonEmptyStringSchema.optional(),
  })
  .meta(
    describe(
      "How the memo was closed: by the decide_memo command, (PS-22) an objection by its second judge's verdict, or (PS-03b) handled by the quest a create_quest or edit_quest naming it made or changed.",
    ),
  );
export type MemoOutcome = z.infer<typeof MemoOutcomeSchema>;

export const MemoDeliverySchema = z
  .strictObject({
    quest: QuestIdSchema.meta(describe('The quest that read it, one of to.quests.')),
    attempt: z.int().min(1).meta(describe("That quest's run whose assignee session read it.")),
    at: DateTimeSchema.meta(describe('When that session opened.')),
  })
  .meta(
    describe(
      '(PS-09c) A memo to quests read by one of them: its assignee session carried it in the advisories block of its prompt, once (memo.delivered).',
    ),
  );
export type MemoDelivery = z.infer<typeof MemoDeliverySchema>;

export const MemoEscalationSchema = z
  .strictObject({
    at: DateTimeSchema,
    action: z.enum(TRIAGE_ACTIONS).meta(describe('What the Chancellor would do with the memo.')),
    quest: QuestIdSchema.optional().meta(
      describe(
        'merge: the open quest it would take the memo in; new_quest: the draft quest made for the owner to confirm.',
      ),
    ),
    addendum: MemoBodySchema.optional().meta(describe("merge: what the quest's description would gain.")),
    holds: unique(z.array(z.enum(DELEGATION_HOLDS)))
      .min(1)
      .meta(describe('Why the owner decides (delegationHolds): the matters it keeps and the limits found.')),
    note: z.string().min(1).max(TRIAGE_NOTE_MAX_LENGTH).meta(describe("The Chancellor's why.")),
  })
  .meta(
    describe(
      "The Chancellor's triage sent the memo to the owner with its advice (PS-03b, escalate_memo): kingdom.delegation does not let the world decide it. The memo stays open until decided; the next triage leaves it alone.",
    ),
  );
export type MemoEscalation = z.infer<typeof MemoEscalationSchema>;

const JUDGED: readonly string[] = MEMO_JUDGEMENTS;
const DELIVERY_ENDS: readonly string[] = MEMO_DELIVERY_OUTCOMES;

const MemoObjectSchema = z.strictObject({
  version: z.literal(1),
  id: MemoIdSchema,
  kind: MemoKindIdSchema.meta(describe('An id of registry/memos.json.')),
  // PS-09c; optional, added after v1, so version stays 1 (ADR 0003).
  from: CharacterIdSchema.optional().meta(
    describe(
      'The character whose letter held the memo; absent, the Steward wrote it (PS-09c: an advisory as its quest reached its base branch).',
    ),
  ),
  quest: QuestIdSchema.meta(
    describe(
      "The quest whose handover letter held the memo; (PS-09c) of the Steward's advisory, the quest that reached its base branch.",
    ),
  ),
  attempt: z
    .int()
    .min(1)
    .meta(
      describe(
        "The quest's run whose session ended with the memo in its letter; (PS-09c) of the Steward's advisory, the quest's last run.",
      ),
    ),
  to: MemoRouteSchema,
  body: MemoBodySchema,
  refs: MemoRefsSchema,
  state: z.enum(MEMO_STATES),
  filed_at: DateTimeSchema,
  outcome: MemoOutcomeSchema.optional(),
  // PS-03b; optional, added after v1, so version stays 1 (ADR 0003).
  escalation: MemoEscalationSchema.optional(),
  // PS-09c; optional, added after v1, so version stays 1 (ADR 0003).
  deliveries: z
    .array(MemoDeliverySchema)
    .optional()
    .meta(describe('(PS-09c) Of a memo to quests: the quests that read it, in order.')),
});

/** (PS-09c) Only a memo to quests is read by them, by those it went to only, and only it is delivered or lapses. */
function checkDeliveries(memo: z.output<typeof MemoObjectSchema>, ctx: z.RefinementCtx): void {
  const to = memo.to.quests;
  if (memo.deliveries?.some(({ quest }) => to?.includes(quest) !== true) === true)
    ctx.addIssue({
      code: 'custom',
      path: ['deliveries'],
      message: 'a memo is read by the quests it went to',
    });
  if (memo.outcome !== undefined && DELIVERY_ENDS.includes(memo.outcome.decision) && to === undefined)
    ctx.addIssue({
      code: 'custom',
      path: ['outcome', 'decision'],
      message: 'only a memo to quests is delivered or lapses',
    });
}

/**
 * Closed exactly when it has an outcome; a memo handled names the quest that does the work, and an objection's
 * second judge its verdict (PS-22).
 */
function checkMemo(memo: z.output<typeof MemoObjectSchema>, ctx: z.RefinementCtx): void {
  if ((memo.state === 'closed') !== (memo.outcome !== undefined))
    ctx.addIssue({ code: 'custom', path: ['outcome'], message: 'a memo has an outcome exactly when closed' });
  if (memo.outcome?.decision === 'handled' && memo.outcome.quest === undefined)
    ctx.addIssue({ code: 'custom', path: ['outcome', 'quest'], message: 'a handled memo names its quest' });
  if (
    memo.outcome !== undefined &&
    JUDGED.includes(memo.outcome.decision) !== (memo.outcome.verdict !== undefined)
  )
    ctx.addIssue({
      code: 'custom',
      path: ['outcome', 'verdict'],
      message: 'a memo a judge closed names its verdict, and only such a memo',
    });
  checkDeliveries(memo, ctx);
}

export const MemoSchema = MemoObjectSchema.superRefine(checkMemo).meta({
  title: 'Memo',
  description:
    "memos/<id>.json: one letter (displayed so; the id is `memo` because `letter` names the handover letter in the code) that a character wrote in the Memos section of its handover letter, one line per memo: `- <kind>: <text> refs: <path>, <path>`. The Steward reads that section when an assignee's run ends through a submit (one whose patch or commit the Steward could not make included), a question or a crash, not when a breaker cut it, files each memo here with an id made from the quest, the kind and the normalized text, so reading the letter again files nothing twice, and routes it by its kind's entry in registry/memos.json (ADR 0024). Characters never write this folder. A memo changes no quest's state and is never answered: it is decided once and closed, by the owner (decide_memo, `elvaria memo decide`, or confirming a draft made from it) or, within kingdom.delegation, by the Chancellor's triage (PS-03b); a memo the triage sends to the owner keeps its advice in `escalation`. (PS-09c) The Steward writes one memo itself, without `from`: an advisory as a quest reaches its base branch, to the quests at work whose scope meets the files it changed, with an id made from that quest alone, so a Steward that stopped and ran again files it once; each of them reads it once, in its next assignee session (`deliveries`), and the Steward closes it `delivered` or `lapsed` once each read it or left.",
  $comment: `${GENERATED_NOTE} Events: memo.filed, memo.routed, memo.delivered, memo.closed. Not expressible here: state = closed exactly when outcome is present; outcome.quest is required when outcome.decision = handled; deliveries name quests of to.quests; outcome.decision is delivered or lapsed only with to.route = quests; the id's day is the day in the quest's id.`,
  allOf: [
    { if: { properties: { state: { const: 'closed' } } }, then: { required: ['outcome'] } },
    { if: { properties: { state: { const: 'open' } } }, then: { not: { required: ['outcome'] } } },
  ],
});

export type Memo = z.infer<typeof MemoSchema>;
