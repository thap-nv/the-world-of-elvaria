// The console bell's mana lines (implementation-plan §3.5, P1-22): a gauge that warns, sleeps or wakes, a whole
// pool or the cap of one model, in the owner's language. The quest notices are in compose.spec.ts.
import { QuestIdSchema, TribeIdSchema } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { lineOf } from './bell.ts';
import type { Notice } from '@elvaria/steward';

const en = translator('en');
const vi = translator('vi');
const gemini = TribeIdSchema.parse('gemini');
const argon = { tribe: gemini, pool: 'gemini_models', model: 'argon' };
const pool = { tribe: gemini, pool: 'claude_gpt_models' };

describe('the console bell on mana', () => {
  it('warns once a gauge nears the cap, naming the cap of one model or the pool', () => {
    expect(lineOf(en, { kind: 'mana_warning', ...argon, window: 'weekly', used_pct: 89.5 })).toBe(
      'Mana running low: the argon cap of tribe gemini has used 89.5% of its weekly window. Near the cap the ' +
        'world stops taking work there; elvaria character model moves a character to another model.',
    );
    expect(lineOf(en, { kind: 'mana_warning', ...pool, window: 'five_hour', used_pct: 90 })).toContain(
      'pool claude_gpt_models of tribe gemini has used 90% of its 5-hour window',
    );
  });

  it('says a gauge ran out, until its reset when known, and came back', () => {
    expect(lineOf(en, { kind: 'mana_asleep', ...argon, resets_at: '2026-11-14T01:51:54Z' })).toBe(
      'Out of mana: the argon cap of tribe gemini, until 2026-11-14T01:51:54Z. What runs on it pauses and keeps ' +
        'its character; the Steward probes just after the reset.',
    );
    expect(lineOf(en, { kind: 'mana_asleep', ...pool })).toContain(
      'Out of mana: pool claude_gpt_models of tribe gemini.',
    );
    expect(lineOf(en, { kind: 'mana_awake', ...pool })).toBe(
      'Mana is back: pool claude_gpt_models of tribe gemini. Its paused quests go on.',
    );
  });

  it('says it in Vietnamese for a Vietnamese owner', () => {
    expect(lineOf(vi, { kind: 'mana_warning', ...argon, window: 'weekly', used_pct: 89.5 })).toBe(
      'Sắp cạn mana: trần riêng của argon, tộc gemini đã dùng 89.5% cửa sổ tuần. Gần trần, thế giới ngừng nhận ' +
        'việc ở đó; elvaria character model chuyển một nhân vật sang model khác.',
    );
    expect(lineOf(vi, { kind: 'mana_awake', ...pool })).toBe(
      'Mana đã về: pool claude_gpt_models của tộc gemini. Nhiệm vụ tạm dừng của nó làm tiếp.',
    );
  });
});

// PS-03: a quest whose judges are all out of mana, and the day's digest.
describe('the console bell on the judges’ mana and the digest', () => {
  const quest = {
    id: QuestIdSchema.parse('q_20261106_7k3m2a'),
    title: 'Thêm script pnpm check',
    rank: 'D',
  } as const;

  it('names the pools that hold every judge, and how to stop waiting', () => {
    const notice: Notice = {
      kind: 'judge_mana',
      quest,
      classes: ['judge'],
      gauges: [{ tribe: gemini, pool: 'gemini_models', resets_at: '2026-11-06T14:00:00+07:00' }],
    };
    expect(lineOf(en, notice)).toBe(
      'Quest q_20261106_7k3m2a «Thêm script pnpm check» waits in review, but every judge who may judge it is out of ' +
        'mana: pool gemini_models of tribe gemini, until 2026-11-06T14:00:00+07:00. The review opens once a pool ' +
        'opens again; not to wait, summon a judge of another model on another pool: elvaria character add <id> ' +
        '--class judge --tribe <tribe>',
    );
    expect(lineOf(en, { ...notice, classes: [] })).toContain('every — who may judge it');
  });

  it('says the digest is written, with its two counts and its file', () => {
    const notice: Notice = {
      kind: 'digest',
      day: '2026-11-06',
      file: 'digest/2026-11-06.md',
      must: 2,
      can_wait: 1,
    };
    expect(lineOf(vi, notice)).toBe(
      'Bản tấu 2026-11-06: 2 việc phải quyết để việc chạy tiếp, 1 việc chờ được. Đọc ở digest/2026-11-06.md.',
    );
  });
});

describe('the console bell on a tribe held by its CLI (A1b of the lessons of 2026-11-13)', () => {
  const held = { tribe: gemini, path: 'C:/agy.exe', checked: '1.5.6' };

  it('names the new version and the command, or the CLI gone and the restart', () => {
    expect(lineOf(en, { kind: 'tribe_held', ...held, version: '1.5.8' })).toBe(
      'Tribe gemini is held: its CLI C:/agy.exe now says 1.5.8, not 1.5.6, the version its last check with the real CLI passed on. No new session for it until elvaria tribe check gemini passes (a little mana).',
    );
    expect(lineOf(vi, { kind: 'tribe_held', ...held, version: undefined })).toBe(
      'Tộc gemini bị giữ: CLI mà Nhiếp chính chạy cho tộc, C:/agy.exe, không còn. elvaria tribe check gemini tìm CLI đang cài và ghim nó khi qua (tốn chút mana); rồi khởi động lại elvaria run.',
    );
  });
});

// Contract infirmary-reason-codes: a coded reason as `quest show` says it, its sentence, the refusing hook's lines
// verbatim and indented, then the detail the sentence did not say.
describe('the console bell on a quest sent to the infirmary', () => {
  const quest = {
    id: QuestIdSchema.parse('q_20261106_7k3m2a'),
    title: 'Đổi luồng đăng nhập',
    rank: 'A',
  } as const;

  it('says a refused commit in Vietnamese, the hook lines under it', () => {
    const reason = {
      code: 'breaker:commit_errors',
      params: { lines: 'lint: error x\nfix it', errors: 1, total_lines: 9, log: '.runs/q-1/pre-commit.log' },
    } as const;
    const detail = { wip: 'index.lock' };
    const notice: Notice = { kind: 'infirmary', quest, reason, trip: 'commit', detail };
    expect(lineOf(vi, notice)).toBe(
      'Nhiệm vụ q_20261106_7k3m2a «Đổi luồng đăng nhập» vào trạm quân y: hook pre-commit từ chối commit, nên nhánh thiếu phần việc; output có 9 dòng, 1 dòng báo lỗi (đủ ở .runs/q-1/pre-commit.log), mấy dòng đầu ở dưới\n' +
        '      lint: error x\n' +
        '      fix it\n' +
        '    Commit WIP cũng bị từ chối, việc vẫn nằm trong đất riêng: index.lock',
    );
  });

  it('does not say again the script its reason named', () => {
    const reason = { code: 'script:fail', params: { script: 'link-check' } } as const;
    const notice: Notice = { kind: 'infirmary', quest, reason, trip: 'script_fail', detail: { script: 'x' } };
    expect(lineOf(en, notice)).toBe(
      'Quest q_20261106_7k3m2a «Đổi luồng đăng nhập» went to the infirmary: the script link-check ran but did not pass',
    );
  });
});
