// An objection for the prompt specs (PS-22): vesper failed run 1 of the quest, the assignee contested it, and a second
// judge reads both; or the second judge failed run 2 again, and the assignee reads both verdicts.
import { VerdictSchema } from '@elvaria/domain';

import { QUEST_ID, RETURNED } from './world.ts';
import type { PromptObjection } from '../prompt/objection.ts';

/** The first judge's fail, the one the objection contests. */
export const CONTESTED = VerdictSchema.parse({ ...RETURNED, verifier_id: 'vesper' });

export const OBJECTION: PromptObjection = {
  verdict: CONTESTED,
  memo: {
    body: 'Ghi chú 1 sai: `scripts/check.spec.ts` đã thử script `check` (commit 1a2b3c4); `pnpm test` in ra 12 test xanh.',
    refs: ['scripts/check.spec.ts'],
  },
};

/** The second judge's fail on run 2, answering the objection: final. */
export const FINAL = VerdictSchema.parse({
  ...RETURNED,
  id: `${QUEST_ID}-2`,
  attempt: 2,
  checks: [],
  notes:
    'Test có rồi, ghi chú 1 không còn đúng; README vẫn chưa nói `pnpm check` chạy i18n:check (ghi chú 2 vẫn đúng).',
  objection: { memo: 'm_20261106_9tw3hx', verdict: CONTESTED.id, judge: CONTESTED.verifier_id },
  session_id: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
  created_at: '2026-11-06T11:30:00+07:00',
});
