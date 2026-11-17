// The `image` check of the conformance suite (PS-11b): only for an adapter that declares `vision`, which promises the
// Steward that a judge of its tribe sees the screens of a review. Live too, one session a tribe (`elvaria tribe check`,
// ELVARIA_LIVE=1): only the real CLI shows whether its rules open a file outside the plot and its model sees it.
import assert from 'node:assert/strict';

import { play } from './play.ts';
import type { ConformanceCheck } from './target.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const imageCheck: ConformanceCheck = {
  id: 'image',
  live: true,
  run: async (target) => {
    const runner = await target.createRunner();
    if (runner.capabilities.vision !== true) return 'skipped';
    await play(target, runner, 'image', {
      verify: ({ result, colors }) => {
        assert.equal(result.outcome, 'completed', 'the judge reading an image did not complete');
        const answer = result.structured;
        assert.ok(isRecord(answer), 'vision declared but the judge gave no structured answer');
        assert.equal(
          answer.opened,
          true,
          'vision declared but the judge could not open the one image its policy opens',
        );
        assert.deepEqual(
          answer.colors,
          colors,
          'the judge named the stripes in another order than the image shows: it did not see the image',
        );
      },
    });
    return 'passed';
  },
};
