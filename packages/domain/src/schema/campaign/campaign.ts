// campaign.json v1: a war is a container for quests, not a kind (implementation-plan §2.3). Used from stage 5;
// the schema exists now so later stages need no domain change. Morale is derived, never stored (§9.1 item 5).
import { z } from 'zod';

import { CampaignIdSchema, QuestIdSchema, SLUG_PATTERN } from '../../core/ids.ts';
import {
  DateTimeSchema,
  GENERATED_NOTE,
  NonEmptyStringSchema,
  rejectDuplicateIds,
  unique,
} from '../common.ts';
import { CAMPAIGN_NAME_MAX_LENGTH } from '../../constants.ts';

const describe = (description: string) => ({ description });
const SlugSchema = z.string().regex(SLUG_PATTERN);

const FrontSchema = z.strictObject({
  id: SlugSchema,
  name: NonEmptyStringSchema,
  goal: NonEmptyStringSchema,
  quest_ids: unique(z.array(QuestIdSchema)),
});

const VictoryCheckSchema = z
  .strictObject({
    type: z.enum(['all_quests_done', 'command']),
    run: NonEmptyStringSchema.optional().meta(describe('Command run in the territory; exit 0 = met.')),
  })
  .refine((check) => check.type !== 'command' || check.run !== undefined, {
    path: ['run'],
    message: 'a command check needs run',
  })
  .meta({ if: { properties: { type: { const: 'command' } } }, then: { required: ['run'] } });

const VictoryConditionSchema = z.strictObject({
  id: SlugSchema,
  text: NonEmptyStringSchema,
  check: VictoryCheckSchema,
  // Required although a new condition is unmet: the v1 contract keeps `met` explicit in the file.
  met: z.boolean().meta({ default: false }),
  checked_at: DateTimeSchema.optional(),
});

export const CampaignSchema = z
  .strictObject({
    version: z.literal(1),
    id: CampaignIdSchema,
    name: z.string().min(1).max(CAMPAIGN_NAME_MAX_LENGTH),
    mode: z.enum(['offense', 'defense']),
    // A front or a condition is referred to by its id, so ids are unique in each list, as in every file.
    fronts: z.array(FrontSchema).superRefine(rejectDuplicateIds),
    victory_conditions: z.array(VictoryConditionSchema).superRefine(rejectDuplicateIds),
    status: z.enum(['declared', 'active', 'won', 'lost', 'retro_pending', 'closed']),
    declared_at: DateTimeSchema,
    deadline: DateTimeSchema.optional(),
    retro_path: NonEmptyStringSchema.optional().meta(
      describe('Relative to the kingdom; the post-war council (retro or postmortem).'),
    ),
    closed_at: DateTimeSchema.optional(),
  })
  .refine((campaign) => campaign.status !== 'closed' || campaign.closed_at !== undefined, {
    path: ['closed_at'],
    message: 'a closed campaign needs closed_at',
  })
  .meta({
    title: 'Campaign',
    description:
      'campaigns/<id>.json: a war (campaign) is a container for quests, not a leaf kind. Offense = release, launch, epic, deadline; defense = incident, vulnerability, crisis. Fronts group quests; victory conditions are checkable. Morale is derived (completion ratio over remaining time) and never stored.',
    $comment: `${GENERATED_NOTE} Used from stage 5; the schema exists from stage 0 so later stages need no domain change. Not expressible here: front ids are unique; victory condition ids are unique.`,
    // The same rule as the refine above, for readers of the JSON contract.
    allOf: [{ if: { properties: { status: { const: 'closed' } } }, then: { required: ['closed_at'] } }],
  });

export type Campaign = z.infer<typeof CampaignSchema>;
