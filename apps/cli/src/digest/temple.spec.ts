// (PS-12g) The digest's items of the Temple in the owner's words: a character suspended for a fail streak with the Monk's
// letters and the command that releases it; the repeated failures while the Temple cannot run, with the command that adds
// a Monk, or, the Temple off with a Monk, the lines of kingdom.json in the advice and no command line.
import { EVENT_VERSION, EventSchema, characterViewOf } from '@elvaria/domain';
import type { AttentionItem, CharacterId, MemoId } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { translator } from '@elvaria/i18n';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { digestMarkdown } from './markdown.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

const SUSPENDED: AttentionItem = {
  kind: 'character_suspended',
  group: 'can_wait',
  advice: 'read_letters_then_release',
  command: ['character', 'release', 'kael'],
  character: 'kael' as CharacterId,
  fail_kind: 'tests_fail',
  count: 3,
  letters: ['m_20261119_4k2pqz' as MemoId],
};
const NO_MONK: AttentionItem = {
  kind: 'temple_no_monk',
  group: 'can_wait',
  advice: 'add_monk',
  command: ['character', 'add', '<id>', '--class', 'monk', '--model', '<model>'],
  count: 2,
  temple_reasons: ['disabled', 'no_monk'],
  class: 'monk',
};
const OFF: AttentionItem = {
  ...NO_MONK,
  kind: 'temple_off',
  advice: 'enable_temple',
  command: [],
  temple_reasons: ['disabled'],
};

const bodyOf = (locale: 'en' | 'vi', items: readonly AttentionItem[]): string[] =>
  digestMarkdown(translator(locale), { day: '2026-11-19', name: 'Bình Minh', items })
    .split('\n')
    .slice(6, -1);

describe('the digest items of the Temple (PS-12g)', () => {
  it('names a suspended character, its streak and letters, and the command that releases it', () => {
    expect(bodyOf('en', [SUSPENDED])).toEqual([
      "- kael waits at the Temple after 3 fails in a row (tests_fail): no new line of scripture has freed it. The Monk's letters on its runs: m_20261119_4k2pqz. Read the Monk's letters first (elvaria memo show <memo>) and do what they ask (a check, a stronger model), then release it.",
      '  `elvaria character release kael`',
    ]);
    expect(bodyOf('vi', [{ ...SUSPENDED, letters: [] }])[0]).toContain(
      'Thư của Thầy tu về các lượt của nó: chưa có.',
    );
  });

  it('counts the repeated failures, says why the Temple cannot run, and adds a Monk', () => {
    expect(bodyOf('en', [NO_MONK])).toEqual([
      '- The Temple cannot run (it is off, no Monk who is not suspended) while 2 kind(s) of failure repeat. Add a character of a class of the Monk; with the Temple off, also turn it on in kingdom.json: "schedule": {"temple": {"enabled": true}}. Each run of the Temple spends mana.',
      '  `elvaria character add <id> --class monk --model <model>`',
    ]);
  });

  it('gives the lines of kingdom.json, and no command line, when only the switch is off', () => {
    expect(bodyOf('vi', [OFF])).toEqual([
      '- Đền chưa chạy được (Đền đang tắt) trong khi 2 kiểu lỗi đang lặp lại. Bật trong kingdom.json: "schedule": {"temple": {"enabled": true}}; Nhiếp chính đọc lại ở nhịp kế. Mỗi lần Đền chạy tốn mana: nhiều nhất một phiên mỗi ngày, cộng một phiên cho mỗi lần đình chỉ.',
    ]);
  });
});

describe('elvaria digest and the Temple (PS-12g)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  it('lists a character the Steward suspended for a fail streak, as the log and its file say', async () => {
    await run(testIo(), 'character', 'add', 'kael', '--class', 'knight', '--kingdom', kingdom);
    const store = openKingdom(kingdom);
    const read = await store.characters.read('kael' as CharacterId);
    if (!read.ok) throw new Error('no kael');
    const suspended = {
      ...read.value,
      status: 'suspended' as const,
      consecutive_fail: { fail_kind: 'tests_fail' as const, count: 3 },
    };
    expect((await store.characters.write(suspended)).ok).toBe(true);
    const line = EventSchema.parse({
      v: EVENT_VERSION,
      id: '01JCF8X4Z6Q3W9N2M5R7T8V001',
      ts: '2026-11-06T08:00:00+07:00',
      type: 'character.suspend',
      actor: { kind: 'steward' },
      data: { character: characterViewOf(suspended) },
    });
    await openEventLog(kingdom).append([line]);
    const io = testIo();
    expect(await run(io, 'digest', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(io.printed.out).toContain('  `elvaria character release kael`');
  });
});
