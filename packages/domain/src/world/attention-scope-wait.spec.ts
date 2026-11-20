// The digest's scope waits: an open quest that waits for a quest whose scope meets its own, and the glob where they meet.
import { describe, expect, it } from 'vitest';

import { Q1, Q2, Q3, TERRITORY, quest, workingBy } from '../dispatch/__fixtures__/snapshot.ts';
import { scopeWaitNoticesOf } from './attention-scope-wait.ts';

const holder = workingBy(quest(Q2, { scope: ['packages/**'] }), 'thorn');

describe('scopeWaitNoticesOf', () => {
  it('names the quest an open quest waits for and the first glob of its own that meets the holder', () => {
    const open = quest(Q1, { scope: ['docs/a.md', 'packages/domain/**', 'packages/store/**'] });
    const notices = scopeWaitNoticesOf([open, holder], []);
    expect(notices).toEqual([{ quest: Q1, holder: Q2, overlap: 'packages/domain/**' }]);
  });

  it('says nothing of a quest whose scope is clear, one that is not open, or one that waits to run alone', () => {
    const clear = quest(Q1, { scope: ['docs/**'] });
    expect(scopeWaitNoticesOf([clear, holder], [])).toEqual([]);
    const working = workingBy(quest(Q1, { scope: ['packages/x.ts'] }), 'kael');
    expect(scopeWaitNoticesOf([working, holder], [])).toEqual([]);
    const bare = quest(Q3);
    expect(scopeWaitNoticesOf([bare, workingBy(quest(Q2), 'thorn')], [])).toEqual([]);
  });

  it('leaves out the territory shared paths', () => {
    const open = quest(Q1, { scope: ['packages/index.ts'] });
    const shared = [{ glob: 'packages/index.ts', merge: 'union' as const }];
    const territory = { id: TERRITORY, shared_paths: shared };
    const other = workingBy(quest(Q2, { scope: ['packages/index.ts'] }), 'thorn');
    expect(scopeWaitNoticesOf([open, other], [territory])).toEqual([]);
    expect(scopeWaitNoticesOf([open, other], [])).toHaveLength(1);
  });
});
