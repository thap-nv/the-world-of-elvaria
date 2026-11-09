import { describe, expect, it } from 'vitest';

import { questId } from '../__fixtures__/git-repo.ts';
import { plotCommitMessage } from './commit-message.ts';

/** What @commitlint/config-conventional checks of a header: a known type, no scope needed, lower-case subject. */
const CONVENTIONAL_HEADER =
  /^(?:build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(?:\([a-z0-9-]+\))?: [a-z]/;
const HEADER_MAX = 100;

describe('plotCommitMessage', () => {
  const quest = questId('a1b2c3');

  it('names the quest in a Conventional header', () => {
    expect(plotCommitMessage.submit(quest)).toBe('chore: submit q_20261107_a1b2c3');
    expect(plotCommitMessage.wip(quest, 'time')).toBe('chore: wip q_20261107_a1b2c3 (time)');
  });

  it("names the branches of a party's merge, and the list a contract leaves (P1-18)", () => {
    expect(plotCommitMessage.merge('quest/q_20261107_d4e5f6', `quest/${quest}`)).toBe(
      'chore: merge quest/q_20261107_d4e5f6 into quest/q_20261107_a1b2c3',
    );
    expect(plotCommitMessage.partsOpen(quest, 'subquests.json')).toBe(
      'chore: remove subquests.json of q_20261107_a1b2c3, its parts are open',
    );
  });

  it('passes what commitlint checks of a header', () => {
    const party = [
      plotCommitMessage.merge('quest/q_20261107_d4e5f6', `quest/${quest}`),
      plotCommitMessage.partsOpen(quest, 'subquests.json'),
    ];
    for (const message of [
      plotCommitMessage.submit(quest),
      plotCommitMessage.wip(quest, 'tokens'),
      ...party,
    ]) {
      expect(message).toMatch(CONVENTIONAL_HEADER);
      expect(message.length).toBeLessThanOrEqual(HEADER_MAX);
    }
  });
});
