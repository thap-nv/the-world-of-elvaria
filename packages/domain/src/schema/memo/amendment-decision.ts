// amendment-decision v1: what a quest's author decides of the doer's amendment (PS-22b, implementation-plan §3.16.2,
// ADR 0024), in a fresh session with no tool. Like memo-triage it is a structured output, given to a CLI with a JSON
// Schema flag and checked here when it comes back; it writes nothing. The caller holds an acceptance against
// kingdom.delegation (delegationHolds) and turns the decision into one decide_amendment command: the Steward stays
// the only writer (ADR 0005).
import { z } from 'zod';

import { DELEGATION_ASK_REASONS } from '../../delegation/constants.ts';
import { GENERATED_NOTE, NonEmptyStringSchema, unique } from '../common.ts';
import { allOfRules, checkRules, issueIf } from '../quest/rules.ts';
import { AMENDMENT_DECISIONS, AMENDMENT_NOTE_MAX_LENGTH } from './constants.ts';
import type { Rule } from '../quest/rules.ts';

const describe = (description: string) => ({ description });

export const AmendmentNoteSchema = z.string().min(1).max(AMENDMENT_NOTE_MAX_LENGTH);

const FieldsSchema = z.strictObject({
  version: z.literal(1),
  decision: z
    .enum(AMENDMENT_DECISIONS)
    .meta(
      describe(
        "accepted: the amendment is right; `description` is the quest's description rewritten. rejected: the description stands. owner: only the owner can decide (it changes what the owner asked for, a party's contract, or another of the owner's matters in `ask`).",
      ),
    ),
  note: AmendmentNoteSchema.meta(
    describe(
      "Why, in the owner's language: the doer's next session reads it as the answer to its amendment, the owner in the digest.",
    ),
  ),
  description: NonEmptyStringSchema.optional().meta(
    describe(
      "accepted: the quest's whole description as it should read now, in the quest template; the judge reads it, never the memo.",
    ),
  ),
  ask: unique(z.array(z.enum(DELEGATION_ASK_REASONS))).meta(
    describe(
      'The matters of the owner the amendment touches, whatever the decision: a recorded decision or what the owner asked for changes, a data contract or a party contract changes, it spends more mana than its rank, it acts outside the machine, it touches protected paths. Empty when none.',
    ),
  ),
});

type Fields = z.output<typeof FieldsSchema>;

/** An accepted amendment, and only one, rewrites the description. */
const rewrites = (reply: Fields) =>
  issueIf(
    (reply.decision === 'accepted') !== (reply.description !== undefined),
    ['description'],
    'an accepted amendment, and only one, rewrites the description',
  );

const RULES: readonly Rule<Fields>[] = [
  {
    contract: {
      if: { properties: { decision: { const: 'accepted' } } },
      then: { required: ['description'] },
    },
    check: rewrites,
  },
  {
    contract: {
      if: { required: ['description'] },
      then: { properties: { decision: { const: 'accepted' } } },
    },
    check: () => [],
  },
];

export const AmendmentDecisionFileSchema = FieldsSchema.superRefine(checkRules(RULES)).meta({
  title: 'Amendment decision',
  description:
    "Structured output of an amendment's author (`decideAmendment`, PS-22b): the Chancellor for a quest it drafted, the mage of the plan for one of its sub-quests, passed to Claude Code with --json-schema. The CLI holds an acceptance against kingdom.delegation (its matters in `ask`, the quest's rank): within it, one decide_amendment command rewrites the description, closes the memo and lets the quest go on; beyond it, or with decision owner, the amendment waits for the owner as a question, with this note.",
  allOf: allOfRules(RULES),
  $comment: `${GENERATED_NOTE} Not expressible here, checked by zod: description is present exactly when decision = accepted.`,
});

export type AmendmentDecisionFile = z.infer<typeof AmendmentDecisionFileSchema>;
