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

  it('passes what commitlint checks of a header', () => {
    for (const message of [plotCommitMessage.submit(quest), plotCommitMessage.wip(quest, 'tokens')]) {
      expect(message).toMatch(CONVENTIONAL_HEADER);
      expect(message.length).toBeLessThanOrEqual(HEADER_MAX);
    }
  });
});
