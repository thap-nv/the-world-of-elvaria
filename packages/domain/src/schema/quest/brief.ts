// The brief (implementation-plan §3.16.6, ADR 0028, PS-06): work large enough for the council starts with what the
// Chancellor understood of the owner's words, with every question for the owner asked at once, each with the answer
// it recommends. Optional and added after v1 of quest-draft, so `version` stays 1 (ADR 0003). The CLI copies it into
// the description of the plan quest it names and has that quest wait for the owner's seal (draftCommands).
import { z } from 'zod';

import { NonEmptyStringSchema } from '../common.ts';
import { QUESTION_MAX_LENGTH } from '../../constants.ts';
import { DraftRefSchema } from './shared.ts';

const describe = (description: string) => ({ description });

const ItemsSchema = z.array(NonEmptyStringSchema);

export const BriefQuestionSchema = z.strictObject({
  question: z.string().min(1).max(QUESTION_MAX_LENGTH),
  recommended: NonEmptyStringSchema.meta(
    describe('The answer the Chancellor recommends: the owner who confirms the plan quest accepts it.'),
  ),
});

export const BriefSchema = z
  .strictObject({
    goal: NonEmptyStringSchema.meta(
      describe("What will be true when the work is done, in the owner's words."),
    ),
    out_of_scope: ItemsSchema.meta(describe('What the work leaves alone, though one might expect it.')),
    acceptance_examples: ItemsSchema.min(1).meta(
      describe(
        'Concrete cases the owner would accept as done: an input and what comes out, a command and its output.',
      ),
    ),
    assumptions: ItemsSchema.meta(describe('What the Chancellor took as given without asking.')),
    questions: z
      .array(BriefQuestionSchema)
      .meta(describe('Every question for the owner, asked once, each with a recommended answer.')),
    plan_ref: DraftRefSchema.meta(
      describe(
        'The draft of kind plan this brief opens: its description gains the brief, and it waits for the seal.',
      ),
    ),
  })
  .meta(
    describe(
      'The brief of work that goes through the council (kingdom.dispatch.council): the owner reads it once, answers its questions or confirms the plan quest, which accepts the recommended answers.',
    ),
  );

export type Brief = z.infer<typeof BriefSchema>;
export type BriefQuestion = z.infer<typeof BriefQuestionSchema>;
