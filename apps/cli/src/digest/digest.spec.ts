// `elvaria digest` and the Steward's digest file (PS-03, implementation-plan §3.16.3): what waits for the owner in
// two groups, each item with its advice and command, in the owner's language. Reads only; the port writes the file.
import { EVENT_VERSION, EventSchema, MemoSchema, TribeIdSchema } from '@elvaria/domain';
import type { AttentionItem, QuestId, WaitGauge } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { translator } from '@elvaria/i18n';
import { inKingdom, openKingdom, pathExists, readTextFile, writeFileAtomic } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import { fileDigest } from '../run/digest-file.ts';
import { digestMarkdown } from './markdown.ts';
import type { TempDir } from '../../test/cli.ts';

const MEMO = MemoSchema.parse({
  version: 1,
  id: 'm_20261106_4k2pqz',
  kind: 'proposal',
  from: 'thorn',
  quest: QUEST_ID,
  attempt: 1,
  to: { route: 'chancellor' },
  body: 'The list prints times in UTC.',
  refs: [],
  state: 'open',
  filed_at: '2026-11-06T08:10:00+07:00',
});

describe('elvaria digest', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const digest = async (locale = 'en') => {
    const io = testIo();
    expect(await run(io, 'digest', '--kingdom', kingdom, '--locale', locale)).toBe(0);
    return io.printed.out;
  };

  it('says nothing waits in a new kingdom, and writes nothing', async () => {
    expect(await digest()).toEqual([
      '# Digest 2026-11-06 · Bình Minh',
      '',
      'Nothing waits for you.',
      '',
      'Built now from the files and the event log. Quests waiting for a judge, and tribes held by their CLI (elvaria doctor names those too), are in the digest the Steward writes to digest/ only.',
    ]);
    expect(await pathExists(inKingdom(kingdom, 'digest'))).toBe(false);
  });

  it('lists the drafts, the quests nobody can take, the open memos and the pools asleep, in their groups', async () => {
    await plantQuests(kingdom, questFixture('draft'), questFixture('open', OTHER_QUEST_ID));
    expect((await openKingdom(kingdom).memos.write(MEMO)).ok).toBe(true);
    const unclaimable = { reason: 'no_class', rank: 'D', class: 'knight' };
    await writeFileAtomic(
      inKingdom(kingdom, '.state/unclaimable.json'),
      JSON.stringify({ version: 1, quests: { [OTHER_QUEST_ID]: unclaimable } }),
    );
    const asleep = EventSchema.parse({
      v: EVENT_VERSION,
      id: '01JCF8X4Z6Q3W9N2M5R7T8V001',
      ts: '2026-11-06T08:30:00+07:00',
      type: 'mana.exhausted',
      actor: { kind: 'steward' },
      data: { tribe: 'claude', pool: 'claude', resets_at: '2026-11-06T13:00:00+07:00' },
    });
    await openEventLog(kingdom).append([asleep]);
    const out = await digest();
    expect(out.slice(0, 13)).toEqual([
      '# Digest 2026-11-06 · Bình Minh',
      '',
      '2 to decide for the work to go on, 2 that can wait.',
      '',
      '## Decide for the work to go on',
      '',
      `- Quest ${OTHER_QUEST_ID} «Thêm script pnpm check» (rank D) is one nobody can take. Read why (elvaria quest show), then summon or level up a character, or edit the quest.`,
      `  \`elvaria quest show ${OTHER_QUEST_ID}\``,
      `- Draft quest ${QUEST_ID} «Thêm script pnpm check» waits for your confirmation. Confirm it to open it, or cancel it (elvaria quest cancel).`,
      `  \`elvaria quest confirm ${QUEST_ID}\``,
      '',
      '## Can wait',
      '',
    ]);
    expect(out.slice(13, 17)).toEqual([
      `- Memo ${MEMO.id} (proposal) from thorn, of quest ${QUEST_ID}, waits for your decision. Read the memo, then decide it once (elvaria memo decide).`,
      `  \`elvaria memo show ${MEMO.id}\``,
      '- Pool claude of tribe claude is out of mana (reset: 2026-11-06T13:00:00+07:00). The Steward probes again after the reset; if you just signed in again, wake it now.',
      '  `elvaria wake claude`',
    ]);
    expect((await digest('vi')).slice(0, 5)).toEqual([
      '# Bản tấu 2026-11-06 · Bình Minh',
      '',
      '2 việc phải quyết để việc chạy tiếp, 2 việc chờ được.',
      '',
      '## Phải quyết để việc chạy tiếp',
    ]);
  });

  it('names a done quest whose scope an open quest waits for (PS-05)', async () => {
    const worked = {
      attempts: 1,
      attempt_log: [
        {
          n: 1,
          character: 'thorn',
          role: 'assignee',
          started_at: '2026-11-06T08:10:00+07:00',
          run_dir: `.runs/${OTHER_QUEST_ID}-1`,
        },
      ],
    };
    const holder = questFixture('done', OTHER_QUEST_ID, { ...worked, scope_paths: ['scripts/**'] });
    await plantQuests(kingdom, holder, questFixture('open', QUEST_ID, { scope_paths: ['scripts/check.ts'] }));
    expect(await digest()).toContain(
      `- Quest ${OTHER_QUEST_ID} «Thêm script pnpm check» is done but still holds its scope; ${QUEST_ID} wait for it. Merge its branch, then archive it: the quests that wait for its scope start.`,
    );
  });
});

describe('the digest file of the Steward', () => {
  let dir: TempDir;
  beforeEach(async () => {
    dir = await tempDir();
  });
  afterEach(() => dir.remove());

  it('writes digest/<day>.md in the owner’s language and names it, the judges out of mana with their pools', async () => {
    const t = translator('en');
    const item: AttentionItem = {
      kind: 'judge_mana',
      group: 'must',
      advice: 'judge_other_pool_or_wait',
      command: ['character', 'add', '<id>', '--class', 'judge', '--tribe', '<tribe>'],
      quest: QUEST_ID as QuestId,
      title: 'Thêm script pnpm check',
      class: 'judge',
      gauges: [
        { tribe: 'gemini', pool: 'gemini_models', resets_at: '2026-11-06T14:00:00+07:00' },
        { tribe: 'claude', pool: 'claude' },
      ] as unknown as readonly WaitGauge[],
    };
    const port = fileDigest(t, dir.root, 'Bình Minh');
    expect(await port.write({ day: '2026-11-06', items: [item] })).toBe('digest/2026-11-06.md');
    const text = await readTextFile(inKingdom(dir.root, 'digest/2026-11-06.md'));
    expect(text).toBe(digestMarkdown(t, { day: '2026-11-06', name: 'Bình Minh', items: [item] }));
    expect(text).toContain(
      `- Quest ${QUEST_ID} «Thêm script pnpm check» waits in review, but every judge who may take it is out of mana (pool gemini_models of tribe gemini, until 2026-11-06T14:00:00+07:00, pool claude of tribe claude).`,
    );
  });

  it('names a tribe held by its CLI with the command that lifts the hold (A1b)', () => {
    const items: AttentionItem[] = [
      {
        kind: 'tribe_held',
        group: 'must',
        advice: 'check_tribe',
        command: ['tribe', 'check', 'gemini'],
        tribe: TribeIdSchema.parse('gemini'),
        path: 'C:/agy.exe',
        version: '1.5.8',
        checked_version: '1.5.6',
      },
      {
        kind: 'tribe_gone',
        group: 'must',
        advice: 'check_tribe_and_restart',
        command: ['tribe', 'check', 'codex'],
        tribe: TribeIdSchema.parse('codex'),
        path: 'C:/old/codex.exe',
        checked_version: '0.167.0',
      },
    ];
    const text = digestMarkdown(translator('en'), { day: '2026-11-06', name: 'Bình Minh', items });
    expect(text).toContain(
      '- Tribe gemini: its CLI C:/agy.exe now says 1.5.8, not 1.5.6, the version its last check with the real CLI passed on; the Steward opens no new session for it.',
    );
    expect(text).toContain('  `elvaria tribe check gemini`');
    expect(text).toContain('- Tribe codex: the CLI its Steward starts, C:/old/codex.exe, is gone');
    expect(text).toContain('then restart elvaria run');
  });
});
