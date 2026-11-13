// memo-triage v1: the Chancellor's triage of the memos sent to it (PS-03b, implementation-plan §3.16.3), one reply for
// a batch. Like quest-draft it is a structured output, given to a CLI with a JSON Schema flag and checked here when it
// comes back; it writes nothing. The caller holds each decision against kingdom.delegation (delegationHolds) and turns
// it into inbox commands: the Steward stays the only writer (ADR 0005).
import { z } from 'zod';

import { MemoIdSchema, QuestIdSchema } from '../../core/ids.ts';
import { DELEGATION_ASK_REASONS, TRIAGE_ACTIONS } from '../../delegation/constants.ts';
import { GENERATED_NOTE, unique } from '../common.ts';
import { DRAFTS_MAX } from '../quest/constants.ts';
import { DraftRefSchema, QuestDraftSchema } from '../quest/quest-draft.ts';
import { allOfRules, checkRules, issueIf } from '../quest/rules.ts';
import { MEMO_BODY_MAX_LENGTH, TRIAGE_MEMOS_MAX, TRIAGE_NOTE_MAX_LENGTH } from './constants.ts';
import type { QuestDraft } from '../quest/quest-draft.ts';
import type { Rule, RuleIssue } from '../quest/rules.ts';

const describe = (description: string) => ({ description });

const DecisionFieldsSchema = z.strictObject({
  memo: MemoIdSchema,
  action: z
    .enum(TRIAGE_ACTIONS)
    .meta(
      describe(
        'merge: into an open quest (`quest`); new_quest: a quest of its own (`draft_ref`); shelve: set aside, nothing to do now or a duplicate already handled; owner: only the owner can decide.',
      ),
    ),
  quest: QuestIdSchema.optional().meta(
    describe('merge: the quest in status draft or open that takes it in.'),
  ),
  draft_ref: DraftRefSchema.optional().meta(
    describe('new_quest: the draft of `drafts` that does the work; duplicate memos name the same draft.'),
  ),
  addendum: z
    .string()
    .min(1)
    .max(MEMO_BODY_MAX_LENGTH)
    .optional()
    .meta(
      describe(
        "merge: what the quest's description gains, in the owner's language. Of duplicate memos merged into one quest, one carries it.",
      ),
    ),
  ask: unique(z.array(z.enum(DELEGATION_ASK_REASONS))).meta(
    describe(
      'The matters of the owner the memo touches: a recorded decision changes, a data contract outside the quest changes, it spends more mana than its rank, it acts outside the machine, it touches protected paths. Empty when none.',
    ),
  ),
  note: z
    .string()
    .min(1)
    .max(TRIAGE_NOTE_MAX_LENGTH)
    .meta(
      describe(
        "Why, in a sentence or two, in the owner's language: the memo's outcome or the digest says it.",
      ),
    ),
});

type DecisionFields = z.output<typeof DecisionFieldsSchema>;

const DECISION_RULES: readonly Rule<DecisionFields>[] = [
  {
    contract: { if: { properties: { action: { const: 'merge' } } }, then: { required: ['quest'] } },
    check: (decision) =>
      issueIf(
        decision.action === 'merge' && decision.quest === undefined,
        ['quest'],
        'a merge names its quest',
      ),
  },
  {
    contract: { if: { properties: { action: { const: 'new_quest' } } }, then: { required: ['draft_ref'] } },
    check: (decision) =>
      issueIf(
        decision.action === 'new_quest' && decision.draft_ref === undefined,
        ['draft_ref'],
        'a new quest names its draft',
      ),
  },
];

export const TriageDecisionSchema = DecisionFieldsSchema.superRefine(checkRules(DECISION_RULES)).meta({
  allOf: allOfRules(DECISION_RULES),
});
export type TriageDecision = z.infer<typeof TriageDecisionSchema>;

interface TriageFields {
  readonly decisions: readonly TriageDecision[];
  readonly drafts: readonly QuestDraft[];
}

/** One decision per memo. */
const twiceDecided = ({ decisions }: TriageFields): readonly RuleIssue[] =>
  decisions.flatMap((decision, index) =>
    issueIf(
      decisions.findIndex(({ memo }) => memo === decision.memo) < index,
      ['decisions', index, 'memo'],
      `memo ${decision.memo} decided twice`,
    ),
  );

/** A new quest names a draft of the reply, whose refs are its own. */
const missingDrafts = ({ decisions, drafts }: TriageFields): readonly RuleIssue[] => {
  const refs = drafts.map(({ ref }) => ref);
  return [
    ...decisions.flatMap((decision, index) =>
      issueIf(
        decision.draft_ref !== undefined && !refs.includes(decision.draft_ref),
        ['decisions', index, 'draft_ref'],
        `no draft "${decision.draft_ref}"`,
      ),
    ),
    ...refs.flatMap((ref, index) =>
      issueIf(refs.indexOf(ref) < index, ['drafts', index, 'ref'], `duplicate ref "${ref}"`),
    ),
  ];
};

/** A memo's new quest is one quest: no plan with children, no party, no draft waiting on another. */
const notAlone = ({ drafts }: TriageFields): readonly RuleIssue[] =>
  drafts.flatMap((draft, index) =>
    issueIf(
      draft.parent_ref !== undefined || draft.depends_on_refs.length > 0 || draft.party_role !== undefined,
      ['drafts', index],
      'a triage draft is one quest of its own: no parent_ref, depends_on_refs or party_role',
    ),
  );

const REPLY_RULES: readonly Rule<TriageFields>[] = [
  { check: twiceDecided },
  { check: missingDrafts },
  { check: notAlone },
];

export const MemoTriageFileSchema = z
  .strictObject({
    version: z.literal(1),
    decisions: z.array(TriageDecisionSchema).min(1).max(TRIAGE_MEMOS_MAX),
    drafts: z
      .array(QuestDraftSchema)
      .max(DRAFTS_MAX)
      .default(() => []),
  })
  .superRefine(checkRules(REPLY_RULES))
  .meta({
    title: 'Memo triage',
    description:
      "Structured output of the Chancellor's triage (`triageMemos`, PS-03b), passed to Claude Code with --json-schema: one decision for each memo of the batch, and the drafts its new quests name (the quest-draft shape). The CLI holds each decision against kingdom.delegation: within it, the Steward applies it with no owner (an edit_quest that merges, a create_quest made open, a decide_memo that sets aside); beyond it, the memo goes to the owner with this advice (escalate_memo, a draft for a new quest) and into the digest.",
    $comment: `${GENERATED_NOTE} Not expressible here, checked by zod: one decision per memo; draft_ref names a draft of the reply; draft refs are unique; a draft has no parent_ref, depends_on_refs or party_role. Not checked by this schema because they need other files: the memos are the batch's and the merge's quest is a draft or open quest (otherwise the memo goes to the owner); the drafts' kinds, tags and secrets exist (screenDrafts).`,
  });

export type MemoTriageFile = z.infer<typeof MemoTriageFileSchema>;
