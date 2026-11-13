import { describe, expect, it } from 'vitest';

import { answerFilesOf } from './query-answer.ts';

/** The shape of `graphify query` (0.9.106): NODE lines, then EDGE lines. */
const ANSWER = [
  'NODE draftQuests() [src=packages/chancellor/src/draft-quests.ts loc=L74 community=3]',
  'NODE heard() [src=packages/chancellor/src/draft-quests.ts loc=L37 community=3]',
  'NODE draft-quests.ts [src=packages/chancellor/src/draft-quests.ts loc= community=3]',
  'NODE say() [src=apps\\cli\\src\\say\\say.ts loc=L52 community=1 attrs={kind=function}]',
  'NODE draftQuests() [src=packages/chancellor/src/draft-quests.ts loc=L74 community=3]',
  'NODE zod [src= loc= community=]',
  'EDGE say() --calls [EXTRACTED]--> draftQuests() at=apps/cli/src/say/say.ts:L60',
  'Traversal: BFS depth=2 | Start: draftQuests()',
].join('\r\n');

describe('answerFilesOf (PS-21b)', () => {
  it('keeps the files of the answer, first named first, each with its distinct names', () => {
    expect(answerFilesOf(ANSWER)).toEqual([
      { path: 'packages/chancellor/src/draft-quests.ts', names: ['draftQuests()', 'heard()'] },
      { path: 'apps/cli/src/say/say.ts', names: ['say()'] },
    ]);
  });

  it('finds nothing in an answer with no node', () => {
    expect(answerFilesOf('No node matches the question.\n')).toEqual([]);
    expect(answerFilesOf('')).toEqual([]);
  });
});
