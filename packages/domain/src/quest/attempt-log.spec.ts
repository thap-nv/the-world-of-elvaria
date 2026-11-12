import { describe, expect, it } from 'vitest';

import { QUEST_ID, questIn, walk } from './__fixtures__/quests.ts';
import { runDirOf } from './attempt-log.ts';

const RUN = `.runs/${QUEST_ID}-1`;

describe('runDirOf', () => {
  it('names the assignee’s folder after the quest and the run, whoever the run is', () => {
    expect(runDirOf(questIn('review'), 1, 'assignee')).toBe(RUN);
    expect(runDirOf(questIn('review'), 3, 'assignee')).toBe(`.runs/${QUEST_ID}-3`);
  });

  it('gives each judge session of a run its own folder, the first one /verify (P1-55)', () => {
    // The first judge's session ends with no verdict, and the next judge opens on the same run.
    const types = ['assign_verifier', 'crash', 'assign_verifier', 'crash', 'assign_verifier'] as const;
    const judged = walk(questIn('review'), types);
    const folders = judged.attempt_log
      .filter(({ role }) => role === 'verifier')
      .map(({ run_dir: dir }) => dir);
    expect(folders).toEqual([`${RUN}/verify`, `${RUN}/verify-2`, `${RUN}/verify-3`]);
    // For a verifier it names the session that opens now: the next one after those the log holds.
    expect(runDirOf(questIn('review'), 1, 'verifier')).toBe(`${RUN}/verify`);
    expect(runDirOf(judged, 1, 'verifier')).toBe(`${RUN}/verify-4`);
    // The count is the run's own: another run's judges do not number this one's.
    expect(runDirOf(judged, 2, 'verifier')).toBe(`.runs/${QUEST_ID}-2/verify`);
  });
});
