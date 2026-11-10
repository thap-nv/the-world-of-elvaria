import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir } from '../../test/cli.ts';

describe('elvaria quest list and show', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const list = (io: ReturnType<typeof testIo>, ...args: string[]) =>
    run(io, 'quest', 'list', ...args, '--kingdom', kingdom);

  it('shows the board with statuses and kinds in the owner language', async () => {
    const attempt = {
      n: 1,
      character: 'thorn',
      role: 'assignee',
      started_at: '2026-11-06T08:10:00+07:00',
      ended_at: '2026-11-06T08:40:00+07:00',
      outcome: 'submitted',
      run_dir: `.runs/${OTHER_QUEST_ID}-1`,
    };
    const review = questFixture('review', OTHER_QUEST_ID, {
      assignee: 'thorn',
      attempts: 1,
      attempt_log: [attempt],
    });
    await plantQuests(kingdom, questFixture('open'), review);
    const io = testIo();
    expect(await list(io)).toBe(0);
    expect(io.printed.out[0]).toMatch(
      /^ID\s+Trạng thái\s+Hạng\s+Dạng\s+Đội\s+Lãnh thổ\s+Người làm\s+Tiêu đề$/,
    );
    expect(io.printed.out[1]).toMatch(
      new RegExp(`^${QUEST_ID}\\s+Mở\\s+D\\s+Kiến tạo\\s+—\\s+do-an\\s+—\\s+Thêm script`),
    );
    expect(io.printed.out[2]).toMatch(
      new RegExp(`^${OTHER_QUEST_ID}\\s+Chờ nghiệm thu\\s+D\\s+Kiến tạo\\s+—\\s+do-an\\s+thorn`),
    );
    const filtered = testIo();
    expect(await list(filtered, '--status', 'review', '--locale', 'en')).toBe(0);
    expect(filtered.printed.out).toHaveLength(2);
    expect(filtered.printed.out[1]).toContain('In review');
    const none = testIo();
    expect(await list(none, '--territory', 'elsewhere', '--locale', 'en')).toBe(0);
    expect(none.printed.out).toEqual(['No quests yet.']);
  });

  it('counts commands still waiting in the inbox, and reports unreadable quest files', async () => {
    await mkdir(path.join(kingdom, 'quests'), { recursive: true });
    await writeFile(path.join(kingdom, 'quests', `${QUEST_ID}.json`), '{');
    await mkdir(path.join(kingdom, 'inbox'), { recursive: true });
    await writeFile(path.join(kingdom, 'inbox', '01JCF8X4Z6Q3W9N2M5R7T8V0YB.json'), '{}');
    const io = testIo();
    expect(await list(io, '--locale', 'en')).toBe(1);
    expect(io.printed.out).toEqual(['No quests yet.', '1 commands wait for the Steward in the inbox.']);
    expect(io.printed.err).toEqual([`quests/${QUEST_ID}.json is not valid JSON.`]);
  });

  it('refuses a status that does not exist', async () => {
    const io = testIo();
    expect(await list(io, '--status', 'finished', '--locale', 'en')).toBe(2);
    expect(io.printed.err[0]).toMatch(/^--status «finished» does not exist; choose one of: draft, open/);
  });

  it('shows one quest with its fields and description', async () => {
    const blocked = questFixture('blocked', QUEST_ID, {
      blocked: { question: 'Dùng pnpm hay npm?', asked_at: '2026-11-06T08:45:00+07:00' },
    });
    await plantQuests(kingdom, blocked);
    const io = testIo();
    expect(await run(io, 'quest', 'show', QUEST_ID, '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    const text = io.printed.out.join('\n');
    expect(io.printed.out[0]).toBe(`${QUEST_ID}  Thêm script pnpm check`);
    expect(text).toMatch(/Status\s+Waiting for an answer \(blocked\)/);
    expect(text).toMatch(/Kind\s+Build \(build\)/);
    expect(text).toMatch(/Attempts\s+0\/3/);
    expect(text).toMatch(/Needs the royal seal\s+no/);
    expect(text).toMatch(/Question\s+Dùng pnpm hay npm\?/);
    expect(io.printed.out.at(-1)).toBe('Gom lint, typecheck và test thành một lệnh.');
    expect(text).not.toContain('Delivered');
  });

  it('shows when a done quest was delivered, its branch and the delivery note to open', async () => {
    const note = `.runs/${QUEST_ID}-delivery.md`;
    const deliverable = {
      type: 'branch',
      branch: `quest/${QUEST_ID}`,
      path: note,
      delivered_at: '2026-11-06T09:00:00+07:00',
    };
    await plantQuests(kingdom, questFixture('done', QUEST_ID, { deliverable }));
    const io = testIo();
    expect(await run(io, 'quest', 'show', QUEST_ID, '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    const text = io.printed.out.join('\n');
    expect(text).toMatch(/Delivered\s+2026-11-06T09:00:00\+07:00/);
    expect(text).toMatch(new RegExp(`Branch\\s+quest/${QUEST_ID}`));
    expect(text).toContain(path.join(kingdom, '.runs', `${QUEST_ID}-delivery.md`));
    const bare = testIo();
    await plantQuests(
      kingdom,
      questFixture('done', QUEST_ID, {
        deliverable: { type: 'none', delivered_at: deliverable.delivered_at },
      }),
    );
    expect(await run(bare, 'quest', 'show', QUEST_ID, '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(bare.printed.out.join('\n')).not.toMatch(/Branch|Delivery note/);
  });

  it('marks the quests the Steward said nobody can take, and shows why with what to do', async () => {
    const notes = {
      [QUEST_ID]: {
        reason: 'level_too_low',
        rank: 'A',
        class: 'knight',
        best_character: 'thorn',
        best_level: 5,
      },
      [OTHER_QUEST_ID]: { reason: 'no_class', rank: 'D', class: 'knight' },
    };
    await mkdir(path.join(kingdom, '.state'), { recursive: true });
    await writeFile(
      path.join(kingdom, '.state', 'unclaimable.json'),
      JSON.stringify({ version: 1, quests: notes }),
    );
    await plantQuests(
      kingdom,
      questFixture('open', QUEST_ID, { rank: 'A' }),
      questFixture('open', OTHER_QUEST_ID),
    );
    const io = testIo();
    expect(await list(io)).toBe(0);
    expect(io.printed.out[1]).toMatch(new RegExp(`^${QUEST_ID}\\s+Mở \\(không ai nhận\\)\\s+A`));
    expect(io.printed.out).toContain('2 nhiệm vụ không ai nhận được; xem lý do: elvaria quest show <id>.');
    const show = testIo();
    expect(await run(show, 'quest', 'show', QUEST_ID, '--kingdom', kingdom)).toBe(0);
    expect(show.printed.out).toEqual(
      expect.arrayContaining([
        'Không ai nhận được hạng A: Hiệp sĩ cao nhất là thorn cấp 5, nhận tới C (B khi không còn ai).',
        `Giao cho thorn (chờ dấu vua): elvaria quest reassign ${QUEST_ID} --to thorn`,
        `Hạ hạng: elvaria quest edit ${QUEST_ID} --rank C`,
        'Triệu hồi: elvaria character add <id> --class knight --level 8',
      ]),
    );
    const none = testIo();
    expect(await run(none, 'quest', 'show', OTHER_QUEST_ID, '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(none.printed.out).toEqual(
      expect.arrayContaining([
        'No Knight can take it: suspended characters and disabled tribes do not count.',
        `Cancel: elvaria quest cancel ${OTHER_QUEST_ID}`,
      ]),
    );
  });

  it("says when the quest's party bars every character of its class, and how to get past it (P1-37 (ii))", async () => {
    const notes = { [QUEST_ID]: { reason: 'party_bars', rank: 'C', class: 'knight' } };
    await mkdir(path.join(kingdom, '.state'), { recursive: true });
    await writeFile(
      path.join(kingdom, '.state', 'unclaimable.json'),
      JSON.stringify({ version: 1, quests: notes }),
    );
    await plantQuests(kingdom, questFixture('open', QUEST_ID, { rank: 'C' }));
    const show = testIo();
    expect(await run(show, 'quest', 'show', QUEST_ID, '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(show.printed.out).toEqual(
      expect.arrayContaining([
        'Its party bars every Knight there is: each one judged a quest of the party, or worked the other side of its blind trial.',
        'Summon: elvaria character add <id> --class knight --level 4',
        `Give it to one of them anyway (your reassign is not barred; the party loses that separation): elvaria quest reassign ${QUEST_ID} --to <character>`,
        `Cancel: elvaria quest cancel ${QUEST_ID}`,
      ]),
    );
  });

  it('shows kinds by id when the registry does not load, and names a missing quest', async () => {
    await plantQuests(kingdom, questFixture('open'));
    await writeFile(path.join(kingdom, 'registry', 'kinds.json'), '{');
    const io = testIo();
    expect(await run(io, 'quest', 'show', QUEST_ID, '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(io.printed.out.join('\n')).toMatch(/Kind\s+build \(build\)/);
    const missing = testIo();
    expect(await run(missing, 'quest', 'show', OTHER_QUEST_ID, '--kingdom', kingdom, '--locale', 'en')).toBe(
      1,
    );
    expect(missing.printed.err).toEqual([`There is no quest ${OTHER_QUEST_ID}.`]);
  });
});
