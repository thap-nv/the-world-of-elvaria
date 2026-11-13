// verdict.json v1: the judgement on one attempt of a quest (implementation-plan §2.3).
import { z } from 'zod';

import {
  CheckIdSchema,
  QuestIdSchema,
  RitualIdSchema,
  SLUG_PATTERN,
  VerdictIdSchema,
} from '../../core/ids.ts';
import {
  DateTimeSchema,
  FailKindSchema,
  GENERATED_NOTE,
  NonEmptyStringSchema,
  rejectDuplicateIds,
} from '../common.ts';
import { FAIL_NOTES_MIN_LENGTH } from './constants.ts';
import { ObjectionSchema } from './objection.ts';
import { allOfRules, checkRules, issueIf } from './rules.ts';
import type { Rule } from './rules.ts';

const describe = (description: string) => ({ description });

/** verifier_id of a royal seal or return by the owner. */
export const USER_VERIFIER = 'user';
/** verifier_id of a verdict the Steward issues from machine checks alone. */
export const MACHINE_VERIFIER = 'machine';
/** After `<quest>-<n>`: the owner's verdict on run n, beside the judge's (P1-04). */
export const OWNER_VERDICT_SUFFIX = `-${USER_VERIFIER}`;
/** After `<quest>-<n>`, then k: the partial verdict the k-th verifier session of run n left (P1-04). */
export const PARTIAL_VERDICT_MARK = '-p';
const PARTIAL_SUFFIX = new RegExp(`^${PARTIAL_VERDICT_MARK}[1-9][0-9]*$`);

const VerdictCheckSchema = z.strictObject({
  id: CheckIdSchema,
  pass: z.boolean(),
  duration_ms: z.int().min(0),
  log_path: NonEmptyStringSchema.meta(describe('Relative to the kingdom: .runs/<quest>-<n>/checks/<id>.log')),
});

const VerdictBreakSchema = z.strictObject({
  change: NonEmptyStringSchema.meta(
    describe('What the judge broke on purpose in its scratch plot: the file, the line and the change.'),
  ),
  red: NonEmptyStringSchema.meta(describe('The command it ran on the break and the tests that went red.')),
});

const VerdictFieldsSchema = z.strictObject({
  version: z.literal(1),
  id: VerdictIdSchema,
  quest_id: QuestIdSchema,
  attempt: z.int().min(1),
  // Not a CharacterId: `user` and `machine` judge too, and neither is a character.
  verifier_id: z
    .string()
    .regex(SLUG_PATTERN)
    .meta(
      describe(
        'A character slug, or `user` (royal seal), or `machine` (Steward-issued verdict from machine checks).',
      ),
    ),
  ritual: RitualIdSchema.meta(describe('RitualId of the quest kind (registry/rituals.json).')),
  // Each check writes its own log (.runs/<quest>-<n>/checks/<id>.log), so one id twice would mean one log lost.
  checks: z.array(VerdictCheckSchema).superRefine(rejectDuplicateIds),
  result: z.enum(['pass', 'fail', 'partial']),
  fail_kind: FailKindSchema.optional().meta(
    describe("Classified so 'same kind of failure' can be counted (same_fail_suspend)."),
  ),
  notes: z
    .string()
    .optional()
    .meta(
      describe(
        'Required and specific when result = fail. Written in kingdom.owner.locale; identifiers, commands, paths and error text verbatim.',
      ),
    ),
  progress: z
    .strictObject({ checked_until: NonEmptyStringSchema })
    .optional()
    .meta(describe('For partial verdicts: where the next verifier continues reading.')),
  breaks: z
    .array(VerdictBreakSchema)
    .optional()
    .meta(
      describe(
        "The judge's breaks in a scratch plot (ritual step break_and_expect_red, P1-40): each change it made on purpose to the code the tests guard, and the red run it caused. There a judge's pass without at least two is taken by the Steward as partial.",
      ),
    ),
  rejudge: z
    .boolean()
    .optional()
    .meta(
      describe(
        "Only on the owner's return (`elvaria return --rejudge`, P1-40): the quest goes back for a new judgement because the judge erred, not the assignee, so the assignee's reputation and fail streak do not count it.",
      ),
    ),
  objection: ObjectionSchema.optional().meta(
    describe(
      "(PS-22) The objection this judge answered, from the quest: the verdict is final, and a pass drops the contested verdict from the assignee's reputation and fail streak, as a rejudge does. Never on the owner's verdict.",
    ),
  ),
  by_human: z.boolean(),
  session_id: NonEmptyStringSchema.optional(),
  created_at: DateTimeSchema,
});

type VerdictFields = z.output<typeof VerdictFieldsSchema>;

const isFail = (verdict: VerdictFields) => verdict.result === 'fail';

/**
 * `<quest_id>-<attempt>`, the file name saying which run it judges (implementation-plan §2.1); `-p<k>` only on a
 * partial verdict and `-user` only on the owner's, so a run's judgements never share a file. A plain id on a
 * partial or a human verdict stays valid: files written before P1-04 read as they did.
 */
function idFits(verdict: VerdictFields): boolean {
  const base = `${verdict.quest_id}-${verdict.attempt}`;
  if (verdict.id === base) return true;
  if (!verdict.id.startsWith(base)) return false;
  const suffix = verdict.id.slice(base.length);
  if (suffix === OWNER_VERDICT_SUFFIX) return verdict.by_human;
  return PARTIAL_SUFFIX.test(suffix) && verdict.result === 'partial';
}

const VERDICT_RULES: readonly Rule<VerdictFields>[] = [
  {
    contract: {
      if: { properties: { result: { const: 'fail' } } },
      then: { required: ['notes', 'fail_kind'], properties: { notes: { minLength: FAIL_NOTES_MIN_LENGTH } } },
    },
    check: (verdict) => [
      ...issueIf(
        isFail(verdict) && (verdict.notes ?? '').length < FAIL_NOTES_MIN_LENGTH,
        ['notes'],
        `a fail verdict needs specific notes (at least ${FAIL_NOTES_MIN_LENGTH} characters)`,
      ),
      ...issueIf(
        isFail(verdict) && verdict.fail_kind === undefined,
        ['fail_kind'],
        'a fail verdict needs fail_kind',
      ),
    ],
  },
  {
    contract: { if: { properties: { result: { const: 'partial' } } }, then: { required: ['progress'] } },
    check: (verdict) =>
      issueIf(
        verdict.result === 'partial' && verdict.progress === undefined,
        ['progress'],
        'a partial verdict needs progress',
      ),
  },
  {
    contract: {
      if: { properties: { by_human: { const: true } } },
      then: { properties: { verifier_id: { const: USER_VERIFIER } } },
    },
    check: (verdict) =>
      issueIf(
        verdict.by_human && verdict.verifier_id !== USER_VERIFIER,
        ['verifier_id'],
        `a human verdict has verifier_id ${USER_VERIFIER}`,
      ),
  },
  {
    contract: {
      if: { properties: { verifier_id: { const: USER_VERIFIER } } },
      then: { properties: { by_human: { const: true } } },
    },
    check: (verdict) =>
      issueIf(
        verdict.verifier_id === USER_VERIFIER && !verdict.by_human,
        ['by_human'],
        `verifier_id ${USER_VERIFIER} is a human verdict`,
      ),
  },
  {
    // A rejudge spares the assignee only the owner's return; a judge's fail or anything else counts (P1-40).
    contract: {
      if: { properties: { rejudge: { const: true } }, required: ['rejudge'] },
      then: { properties: { by_human: { const: true }, result: { const: 'fail' } } },
    },
    check: (verdict) =>
      issueIf(
        verdict.rejudge === true && !(verdict.by_human && isFail(verdict)),
        ['rejudge'],
        "rejudge marks only the owner's return, a human fail verdict",
      ),
  },
  {
    // A second judge answers an objection (PS-22); the owner's word is never one of its rounds.
    contract: {
      if: { required: ['objection'] },
      then: { properties: { by_human: { const: false } } },
    },
    check: (verdict) =>
      issueIf(
        verdict.objection !== undefined && verdict.by_human,
        ['objection'],
        "an objection is answered by a judge, never by the owner's verdict",
      ),
  },
  {
    check: (verdict) =>
      issueIf(
        !idFits(verdict),
        ['id'],
        "the verdict id is <quest_id>-<attempt>, with -p<k> on a partial verdict and -user on the owner's",
      ),
  },
  {
    // A character judges in a session the Steward spawned; validateVerdict matches it against attempt_log.
    check: (verdict) =>
      issueIf(
        verdict.verifier_id !== USER_VERIFIER &&
          verdict.verifier_id !== MACHINE_VERIFIER &&
          verdict.session_id === undefined,
        ['session_id'],
        "a character's verdict names its session",
      ),
  },
];

export const VerdictSchema = VerdictFieldsSchema.superRefine(checkRules(VERDICT_RULES)).meta({
  title: 'Verdict',
  description:
    'verdicts/<quest>-<n>.json: the judgement on attempt n of a quest. Written by a judge in a fresh session spawned by the Steward, by the Steward itself (`machine`: script tier or verifier_same_family = machine_only), or by the owner (`user`: royal seal or return, weighs 3x in reputation; file <quest>-<n>-user.json). A partial verdict, left by a judge stopped before the end, is <quest>-<n>-p<k>.json, k counting the verifier sessions of run n. Machine checks run before the judge and are the primary judge.',
  $comment: `${GENERATED_NOTE} Not expressible here, checked by zod: id = quest_id + '-' + attempt, followed by -p<k> only when result = partial and by -user only when by_human = true; a character verdict (verifier_id neither user nor machine) has a session_id. Not checked by this schema because they need the quest or the registry, enforced by validateVerdict in packages/domain: verifier_id is neither the assignee nor anyone who worked the quest; a character verdict is valid only if session_id belongs to a verifier attempt in quest.attempt_log spawned by the Steward (never a sub-agent of the worker); under pass_rule all_checks_and_agent or checks_only, result is never pass while any check has pass = false. Enforced by the Steward when a judge hands a verdict in, not here, so files written before P1-40 stay valid: a judge's pass has notes, and in a scratch plot whose ritual breaks code it has at least two breaks, else it is taken as partial.`,
  allOf: allOfRules(VERDICT_RULES),
});

export type Verdict = z.infer<typeof VerdictSchema>;
export type VerdictCheck = Verdict['checks'][number];
