// `elvaria memo list|show|decide` (PS-02, ADR 0024): the letters characters wrote, as the owner reads and decides
// them. The memos are planted as the Steward files them; the CLI only reads memos/ and writes decide_memo commands.
import { MemoSchema } from '@elvaria/domain';
import type { InboxCommand, Memo } from '@elvaria/domain';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

const OPEN = 'm_20261106_4k2pqz';
const CLOSED = 'm_20261106_9tw3hx';

const memo = (id: string, extra: Record<string, unknown> = {}): Memo =>
  MemoSchema.parse({
    version: 1,
    id,
    kind: 'proposal',
    from: 'thorn',
    quest: QUEST_ID,
    attempt: 2,
    to: { route: 'chancellor' },
    body: '`quest list` in giờ UTC; nên dùng múi giờ của vương quốc như `quest show` đã làm từ P1-56.',
    refs: ['apps/cli/src/quest/list.ts', 'apps/cli/src/table.ts'],
    state: 'open',
    filed_at: '2026-11-06T08:10:00+07:00',
    ...extra,
  });

const DECIDED = {
  state: 'closed',
  filed_at: '2026-11-06T07:00:00+07:00',
  body: 'README của store còn nói năm file.',
  refs: [],
  outcome: { decision: 'handled', at: '2026-11-06T08:40:00+07:00', quest: QUEST_ID, note: 'Gộp vào.' },
} as const;

describe('elvaria memo', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const elvaria = (io: TestIo, ...args: string[]) => run(io, ...args, '--kingdom', kingdom, '--locale', 'en');
  const inbox = async (): Promise<InboxCommand[]> =>
    (await openKingdom(kingdom).inbox.read()).flatMap((item) =>
      item.command.ok ? [item.command.value] : [],
    );
  const plant = async (...memos: Memo[]) => {
    for (const each of memos) expect((await openKingdom(kingdom).memos.write(each)).ok).toBe(true);
  };

  it('lists the open letters, all of them with --all, and says when there is none', async () => {
    const none = testIo();
    expect(await elvaria(none, 'memo', 'list')).toBe(0);
    expect(none.printed.out).toEqual([
      'No open letters (elvaria memo list --all shows the decided ones too).',
    ]);
    await plant(memo(OPEN), memo(CLOSED, DECIDED));
    const open = testIo();
    expect(await elvaria(open, 'memo', 'list')).toBe(0);
    expect(open.printed.out[0]).toMatch(/^ID\s+Kind\s+Status\s+From\s+Quest\s+Text$/);
    expect(open.printed.out.slice(1)).toEqual([
      expect.stringMatching(
        new RegExp(`^${OPEN}\\s+proposal\\s+Open\\s+thorn\\s+${QUEST_ID}\\s+\`quest list\` in giờ UTC.*…$`),
      ),
    ]);
    const all = testIo();
    expect(await elvaria(all, 'memo', 'list', '--all')).toBe(0);
    expect(all.printed.out.slice(1).map((line) => line.slice(0, OPEN.length))).toEqual([CLOSED, OPEN]);
  });

  it('shows a letter with its fields and whole text, and how to decide it while it is open', async () => {
    await plant(memo(OPEN), memo(CLOSED, DECIDED));
    const open = testIo();
    expect(await elvaria(open, 'memo', 'show', OPEN)).toBe(0);
    const text = open.printed.out.join('\n');
    expect(open.printed.out[0]).toBe(OPEN);
    expect(text).toMatch(/Kind\s+Proposal \(proposal\)/);
    expect(text).toMatch(/Status\s+Open \(open\)/);
    expect(text).toMatch(/Run\s+2/);
    expect(text).toMatch(/Files\s+apps\/cli\/src\/quest\/list\.ts, apps\/cli\/src\/table\.ts/);
    expect(text).toContain(memo(OPEN).body);
    expect(open.printed.out.at(-1)).toContain(`elvaria say --memo ${OPEN}`);
    const closed = testIo();
    expect(await elvaria(closed, 'memo', 'show', CLOSED)).toBe(0);
    const decided = closed.printed.out.join('\n');
    expect(decided).toMatch(/Decision\s+Handled by a quest \(handled\)/);
    expect(decided).toMatch(new RegExp(`Handled by\\s+${QUEST_ID}`));
    expect(decided).toMatch(/Note\s+Gộp vào\./);
    expect(decided).toMatch(/Files\s+—/);
    expect(decided).not.toContain('elvaria say --memo');
    const unknown = testIo();
    expect(await elvaria(unknown, 'memo', 'show', 'm_1')).toBe(1);
    expect(printed(unknown)).toBe('There is no letter m_1.');
  });

  it('sends the decision as a decide_memo command', async () => {
    await plantQuests(kingdom, questFixture('open'));
    await plant(memo(OPEN));
    const io = testIo();
    expect(
      await elvaria(io, 'memo', 'decide', OPEN, 'handled', '--quest', QUEST_ID, '--note', ' Gộp vào. '),
    ).toBe(0);
    expect(io.printed.out[0]).toBe(`Sent your decision on letter ${OPEN}: Handled by a quest.`);
    const shelve = testIo();
    expect(await elvaria(shelve, 'memo', 'decide', OPEN, 'shelved', '--note', '  ')).toBe(0);
    expect((await inbox()).map(({ kind, payload }) => [kind, payload])).toEqual([
      ['decide_memo', { memo: OPEN, decision: 'handled', quest: QUEST_ID, note: 'Gộp vào.' }],
      ['decide_memo', { memo: OPEN, decision: 'shelved' }],
    ]);
  });

  it.each([
    [['maybe'], 2, '"maybe" is no decision: give one of shelved, rejected, handled.'],
    [['handled'], 2, 'A handled letter names the quest that does the work: --quest <quest>.'],
    [['rejected', '--quest', QUEST_ID], 2, '--quest goes with handled only.'],
    [['handled', '--quest', 'q_20261106_zzzzzz'], 1, 'There is no quest q_20261106_zzzzzz.'],
  ])('refuses %j before anything is sent', async (args, code, message) => {
    await plant(memo(OPEN));
    const io = testIo();
    expect(await elvaria(io, 'memo', 'decide', OPEN, ...args)).toBe(code);
    expect(printed(io)).toBe(message);
    expect(await inbox()).toEqual([]);
  });

  it('refuses a letter that is unknown or decided already', async () => {
    await plant(memo(CLOSED, DECIDED));
    const unknown = testIo();
    expect(await elvaria(unknown, 'memo', 'decide', OPEN, 'rejected')).toBe(1);
    expect(printed(unknown)).toBe(`There is no letter ${OPEN}.`);
    const closed = testIo();
    expect(await elvaria(closed, 'memo', 'decide', CLOSED, 'rejected')).toBe(1);
    expect(printed(closed)).toBe(`Letter ${CLOSED} is decided already: a letter is decided once.`);
    expect(await inbox()).toEqual([]);
  });
});
