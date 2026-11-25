import { MemoSchema } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { openKingdom, readTextFile, inKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NOW, foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../__fixtures__/quest.ts';
import { watchInterval } from './watch.ts';
import { watchTable } from './table.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

describe('watch command', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  it('prints an empty message once through the registered command', async () => {
    const io = testIo();
    expect(await run(io, 'watch', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(io.printed.out).toEqual(['No unfinished quests.']);
    expect(io.printed.err).toEqual([]);
  });

  it.each(['abc', '5abc', '1.5', '0', '-1', '', 'Infinity', '1e3'])('rejects interval %s', async (value) => {
    const io = testIo();
    expect(await run(io, 'watch', '--kingdom', kingdom, '--locale', 'en', `--interval=${value}`)).toBe(2);
    expect(io.printed.err).toEqual(['--interval must be a whole number of seconds, at least 1.']);
    expect(io.printed.out).toEqual([]);
  });

  it('accepts whole seconds and defaults to five', () => {
    expect(watchInterval(undefined)).toBe(5);
    expect(watchInterval('1')).toBe(1);
    expect(watchInterval('12')).toBe(12);
    expect(watchInterval('3000000')).toBe(3000000);
  });

  it('renders the pure board, excludes finished quests, and lists seals and open memos', async () => {
    const stored = await openKingdom(kingdom).kingdom.read();
    if (!stored.ok) throw new Error('missing kingdom fixture');
    const source = {
      kingdom: stored.value,
      territories: [],
      characters: [],
      quests: [
        questFixture('awaiting_seal', QUEST_ID, { assignee: 'thorn' }),
        questFixture('done', OTHER_QUEST_ID),
        questFixture('archived', 'q_20261106_9m4n3b'),
      ],
      memos: [
        MemoSchema.parse({
          version: 1,
          id: 'm_20261106_4k2pqz',
          kind: 'proposal',
          from: 'thorn',
          quest: QUEST_ID,
          attempt: 1,
          to: { route: 'chancellor' },
          body: 'Improve the board.',
          refs: [],
          state: 'open',
          filed_at: '2026-11-06T08:10:00+07:00',
        }),
      ],
    };
    const out = watchTable(translator('en'), source, [], NOW);
    expect(out.split('\n')[0]).toMatch(/^ID\s+Title\s+Assignee\s+Status$/);
    expect(out.split('\n')[1]).toContain('thorn');
    expect(out).toContain('Waiting for you');
    expect(out).toContain('elvaria seal');
    expect(out).toContain('m_20261106_4k2pqz');
    expect(out).not.toContain(OTHER_QUEST_ID);
    expect(out).not.toContain('q_20261106_9m4n3b');
    expect(watchTable(translator('vi'), { ...source, quests: [], memos: [] }, [], NOW)).toBe(
      'Không có nhiệm vụ chưa kết thúc.',
    );
  });

  it('prints draft and blocked rows, the assignee, and the question without changing files', async () => {
    await plantQuests(
      kingdom,
      questFixture('draft'),
      questFixture('blocked', OTHER_QUEST_ID, {
        assignee: 'thorn',
        blocked: { question: 'Which branch?', asked_at: '2026-11-06T08:30:00+07:00' },
      }),
    );
    const file = inKingdom(kingdom, `quests/${OTHER_QUEST_ID}.json`);
    const before = await readTextFile(file);
    const io = testIo();
    expect(await run(io, 'watch', '--kingdom', kingdom, '--locale', 'en', '--interval', '1')).toBe(0);
    const out = io.printed.out.join('\n');
    expect(out).toContain(QUEST_ID);
    expect(out).toContain(OTHER_QUEST_ID);
    expect(out).toContain('thorn');
    expect(out).toContain(translator('en')('quest.status.draft'));
    expect(out).toContain(translator('en')('quest.status.blocked'));
    expect(out).toContain('Which branch?');
    expect(out).toContain('Waiting for you');
    expect(out).not.toContain('\u001b');
    expect(await readTextFile(file)).toBe(before);
    expect(await openKingdom(kingdom).inbox.read()).toEqual([]);
  });
});
