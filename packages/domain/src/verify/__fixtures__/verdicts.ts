// Verdicts and a reviewed quest for the specs of src/verify/, every verdict valid by its schema.
import { Q1, inReview, moved, quest } from '../../dispatch/__fixtures__/snapshot.ts';
import { VerdictSchema } from '../../schema/quest/verdict.ts';
import type { CheckId, RitualId } from '../../core/ids.ts';
import type { Verdict, VerdictCheck } from '../../schema/quest/verdict.ts';

export const AT = '2026-11-06T11:00:00+07:00';
export const RITUAL = 'build_review' as RitualId;

const check = (id: string, pass: boolean): VerdictCheck => ({
  id: id as CheckId,
  pass,
  duration_ms: 1200,
  log_path: `.runs/${Q1}-1/checks/${id}.log`,
});
export const LINT = check('lint', true);
export const UNIT = check('unit', false);
export const NOTES = 'The total ignores the discount in src/api/orders.ts.';

/** Q1 submitted by thorn and judged by sable in session `s-1`. */
export const reviewed = moved(inReview(quest(Q1), 'thorn'), 30, [
  'assign_verifier',
  'steward',
  { verifier: 'sable', session_id: 's-1' },
]);

/** sable's pass on run 1 of Q1, the lint check passed; `fields` change it. */
export const verdictOf = (fields: Partial<Verdict> = {}): Verdict =>
  VerdictSchema.parse({
    version: 1,
    id: `${Q1}-1`,
    quest_id: Q1,
    attempt: 1,
    verifier_id: 'sable',
    ritual: RITUAL,
    checks: [LINT],
    result: 'pass',
    by_human: false,
    session_id: 's-1',
    created_at: AT,
    ...fields,
  });
