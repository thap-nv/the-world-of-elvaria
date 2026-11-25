// `elvaria digest` and the Steward's digest file (PS-03, implementation-plan §3.16.3): what waits for the owner in
// two groups, each item with its advice and command, in the owner's language. Reads only; the port writes the file.
import { EVENT_VERSION, EventSchema, MemoSchema, TribeIdSchema } from '@elvaria/domain';
import type { AttentionItem, QuestId, WaitGauge } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { translator } from '@elvaria/i18n';
import { inKingdom, openKingdom, pathExists, readTextFile, writeFileAtomic } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../__fixtures__/quest.ts';
import { fileDigest } from '../run/digest-file.ts';
import { digestMarkdown } from './markdown.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

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
      `- Quest ${OTHER_QUEST_ID} «Thêm script pnpm check» is done but still holds its scope; ${QUEST_ID} wait for it. Merge its branch: the Steward archives it at its next look at the base branch (within 10 minutes), and the quests that wait for its scope start.`,
    );
  });

  // (D) of fix/quest-hold: a held quest waited for the owner and no digest said so.
  it('names each quest the owner holds, with why, and the command that lifts the hold', async () => {
    const hold = { at: '2026-11-06T08:20:00+07:00', reason: 'Waits for PS-09d on main.' };
    await plantQuests(
      kingdom,
      questFixture('open', QUEST_ID, { held: hold }),
      questFixture('open', OTHER_QUEST_ID, { held: { at: hold.at } }),
    );
    const out = await digest('vi');
    expect(out.join('\n')).toContain(
      `- Đang giữ: nhiệm vụ ${QUEST_ID} «Thêm script pnpm check», lý do: Waits for PS-09d on main.`,
    );
    expect(out).toContain(`  \`elvaria quest unhold ${QUEST_ID}\``);
    expect(out.join('\n')).toContain(
      `- Đang giữ: nhiệm vụ ${OTHER_QUEST_ID} «Thêm script pnpm check», lý do: —.`,
    );
  });

  // fix/review-no-session: on PS-07's kingdom an agy judge's session could not open for 16 minutes, and no digest
  // said so.
  it('names a quest that waits in review after its judge could not open a session, and the judge', async () => {
    const at = '2026-11-06T08:20:00+07:00';
    const run = (role: string, character: string) => ({ n: 1, character, role, started_at: at });
    const reviewed = questFixture('review', QUEST_ID, {
      assignee: 'thorn',
      attempts: 1,
      attempt_log: [
        { ...run('assignee', 'thorn'), ended_at: at, outcome: 'submitted', run_dir: `.runs/${QUEST_ID}-1` },
        {
          ...run('verifier', 'ilse'),
          ended_at: at,
          outcome: 'no_session',
          run_dir: `.runs/${QUEST_ID}-1/verify`,
        },
      ],
    });
    await plantQuests(kingdom, reviewed);
    const said = await digest();
    expect(said).toContain(
      `- Quest ${QUEST_ID} «Thêm script pnpm check» waits in review, but the session of its judge ilse could not open (the Steward's log says why, on its «no session for ilse» line). Another judge takes it once free; each session that could not open counts toward the run's judges. If this judge's tribe cannot take work this size (a prompt longer than its CLI takes), suspend it until that is fixed.`,
    );
    expect(said).toContain('  `elvaria character suspend ilse`');
    expect((await digest('vi')).join('\n')).toContain('nhưng phiên của người chấm ilse không mở được');
  });

  // PS-08c: the outcomes of the deliveries to the forge come from the log.
  it('names a delivery that stopped with why and the command, and a pull request open for the owner', async () => {
    await plantQuests(kingdom, questFixture('done'), questFixture('done', OTHER_QUEST_ID));
    const url = 'https://github.com/elvaria-specs/kingdom-repo/pull/7';
    const line = (id: string, type: string, data: Record<string, unknown>) =>
      EventSchema.parse({
        v: EVENT_VERSION,
        id,
        ts: '2026-11-06T08:40:00+07:00',
        type,
        actor: { kind: 'steward' },
        data: { territory: 'do-an', ...data },
      });
    await openEventLog(kingdom).append([
      line('01JCF8X4Z6Q3W9N2M5R7T8V002', 'delivery.failed', {
        quest: QUEST_ID,
        stage: 'push',
        reason: 'no_credential',
      }),
      line('01JCF8X4Z6Q3W9N2M5R7T8V003', 'delivery.pushed', {
        quest: OTHER_QUEST_ID,
        branch: `quest/${OTHER_QUEST_ID}`,
        head: 'a'.repeat(40),
        forge: 'github',
        pr: { number: 7, url },
      }),
    ]);
    const said = await digest();
    expect(said).toContain(
      `- The delivery of quest ${QUEST_ID} «Thêm script pnpm check» stopped at the push: git has no credential for the forge; sign in (git credential, Git Credential Manager), then deliver again. Once fixed, deliver it again: the Steward does not try again on its own.`,
    );
    expect(said).toContain(`  \`elvaria quest deliver ${QUEST_ID}\``);
    expect(said).toContain(
      `- The pull request of quest ${OTHER_QUEST_ID} «Thêm script pnpm check» is open for you (${url}). Read and merge the pull request on the forge: the Steward archives the quest and gives its plot back at its next look (within 10 minutes).`,
    );
    expect(said).toContain(`  \`elvaria quest archive ${OTHER_QUEST_ID}\``);
  });
});

describe('the digest file of the Steward', () => {
  it('prints narrow escape counts and recommends full checks in both languages', () => {
    const item: AttentionItem = {
      kind: 'narrow_escapes',
      group: 'can_wait',
      advice: 'consider_full',
      command: ['metrics'],
      territory: questFixture('archived').territory,
      merges: 12,
      escapes: 2,
    };
    const digest = { day: '2026-11-06', name: 'Bình Minh', items: [item] };
    const english = digestMarkdown(translator('en'), digest);
    expect(english).toContain('Territory do-an: 2 escaped check conclusions in the latest 12 merges');
    expect(english).toContain('consider returning the territory to full checks');
    expect(english).toContain('  `elvaria metrics`');
    const vietnamese = digestMarkdown(translator('vi'), digest);
    expect(vietnamese).toContain('Lãnh thổ do-an: 2 kết luận lỗi lọt trong 12 merge gần nhất');
    expect(vietnamese).toContain('cân nhắc đưa lãnh thổ về kiểm full');
    expect(english).not.toContain('{escapes}');
    expect(english).not.toContain('{merges}');
  });

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
