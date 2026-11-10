// The nested objects of quest.json v1 (implementation-plan §2.3); the quest itself and its rules are in quest.ts.
import { z } from 'zod';

import { CharacterIdSchema, QUEST_ID_PATTERN, QuestIdSchema, ScriptIdSchema } from '../../core/ids.ts';
import {
  DateTimeSchema,
  DELIVERABLE_TYPES,
  NonEmptyStringSchema,
  RoleSchema,
  rejectDuplicateIds,
} from '../common.ts';
import { ScriptParamsSchema } from './shared.ts';
import { allOfRules, checkRules, issueIf } from './rules.ts';
import type { Rule } from './rules.ts';

const describe = (description: string) => ({ description });

/** `git worktree add ... -b quest/<quest-id>` (implementation-plan §3.3): the plot branch is named after the quest. */
const QUEST_BRANCH_PATTERN = new RegExp(QUEST_ID_PATTERN.source.replace('^', '^quest/'));

export const QuestScriptSchema = z
  .strictObject({
    id: ScriptIdSchema,
    params: ScriptParamsSchema.default(() => ({})).meta(
      describe("Validated against the script's params_schema."),
    ),
  })
  .meta(describe('Required when tier = script; id from registry/scripts.json. No model call, mana 0.'));

export const BudgetSchema = z
  .strictObject({
    max_minutes: z.int().min(1),
    max_tokens: z.int().min(0),
    max_attempts: z.int().min(1),
  })
  .meta(describe('Derived from kingdom.breakers and rank; the owner may edit it.'));

// `partial` came after v1 (P1-42): a judge's session that handed in a partial verdict, told apart from one that
// judged, so the run's partials can be counted. An entry written before ended `submitted`; version stays 1.
export const ATTEMPT_OUTCOMES = [
  'submitted',
  'partial',
  'returned',
  'timeout',
  'breaker',
  'crash',
  'paused',
  'blocked',
  'cancelled',
] as const;

export const AttemptSchema = z.strictObject({
  n: z.int().min(1),
  character: CharacterIdSchema.nullable().meta(
    describe('null for script-tier runs (the Steward runs the script).'),
  ),
  role: RoleSchema,
  started_at: DateTimeSchema,
  ended_at: DateTimeSchema.optional(),
  outcome: z
    .enum(ATTEMPT_OUTCOMES)
    .optional()
    .meta(
      describe(
        'timeout = the time breaker tripped; breaker = the token or turn breaker tripped; partial = a judge handed in a partial verdict (since P1-42, submitted before).',
      ),
    ),
  session_id: NonEmptyStringSchema.optional(),
  tokens: z.int().min(0).optional(),
  run_dir: z
    .string()
    .regex(/^\.runs\/[^\\]+$/)
    .meta(describe('Relative to the kingdom: .runs/<quest>-<n> (verifier: .runs/<quest>-<n>/verify).')),
});

const PlotObjectSchema = z.strictObject({
  type: z.enum(['worktree', 'folder', 'none']),
  path: NonEmptyStringSchema.optional(),
  branch: z.string().regex(QUEST_BRANCH_PATTERN).optional(),
});

const PLOT_RULES: readonly Rule<z.output<typeof PlotObjectSchema>>[] = [
  {
    contract: { if: { properties: { type: { const: 'worktree' } } }, then: { required: ['path', 'branch'] } },
    check: (plot) => [
      ...issueIf(plot.type === 'worktree' && plot.path === undefined, ['path'], 'a worktree plot needs path'),
      ...issueIf(
        plot.type === 'worktree' && plot.branch === undefined,
        ['branch'],
        'a worktree plot needs branch',
      ),
    ],
  },
  {
    contract: { if: { properties: { type: { const: 'folder' } } }, then: { required: ['path'] } },
    check: (plot) =>
      issueIf(plot.type === 'folder' && plot.path === undefined, ['path'], 'a folder plot needs path'),
  },
];

export const PlotSchema = PlotObjectSchema.superRefine(checkRules(PLOT_RULES)).meta({
  description:
    "The quest's own ground. worktree: absolute path <territory.path>/<worktree_dir>/<id> on branch quest/<id>; folder: quests/<id>/work (only for non-git territories).",
  allOf: allOfRules(PLOT_RULES),
});

export const DeliverableSchema = z
  .strictObject({
    type: z.enum(DELIVERABLE_TYPES),
    path: NonEmptyStringSchema.optional(),
    branch: NonEmptyStringSchema.optional(),
    delivered_at: DateTimeSchema.optional(),
  })
  .meta(
    describe(
      "Delivery follows the kind's convention; delivered_at marks done-and-delivered (not a separate status).",
    ),
  );

export const SealSchema = z.strictObject({ at: DateTimeSchema, note: z.string().optional() });

export const BlockedSchema = z.strictObject({
  question: NonEmptyStringSchema,
  asked_at: DateTimeSchema,
  answer: z.string().optional(),
  answered_at: DateTimeSchema.optional(),
});

export const UnitSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  label: NonEmptyStringSchema,
  outcome: z
    .enum(['pending', 'done', 'not_done', 'needs_user', 'debt'])
    .meta(describe('Muster after battle: done = kill, not_done = grave, needs_user = wounded, debt = ruin.')),
  child_quest: QuestIdSchema.optional(),
});

// Unit ids key the muster and the child quests opened for them, so a repeated id would merge two units.
export const UnitsSchema = z.array(UnitSchema).superRefine(rejectDuplicateIds);

export type Attempt = z.infer<typeof AttemptSchema>;
export type Plot = z.infer<typeof PlotSchema>;
export type Deliverable = z.infer<typeof DeliverableSchema>;
export type QuestUnit = z.infer<typeof UnitSchema>;
