// The console bell's mana lines (implementation-plan §3.5, P1-22): a gauge that warns, sleeps or wakes, a whole
// pool or the cap of one model, in the owner's language. The quest notices are in compose.spec.ts, but for a quest
// that waits for a judge who reads images (PS-11), a merge quest's merge that stopped (PS-08e) and a delivery to the
// forge (PS-08c), here as compose.spec.ts is at its size limit.
import { CharacterIdSchema, QuestIdSchema, TribeIdSchema } from '@elvaria/domain';
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

  // HL-05: a healer's heal that ended there rings with the `## Heal` section of its letter.
  it("prints the healer's note under the reason, one line each", () => {
    const reason = { code: 'heal:out_of_work', params: { count: 1 } } as const;
    const heal = {
      healer: CharacterIdSchema.parse('mira'),
      text: 'Removed `let unused;`.\nsrc/other.ts needed a rename too.',
    } as const;
    const notice: Notice = { kind: 'infirmary', quest, reason, trip: 'commit', heal_note: heal };
    const lines = lineOf(vi, notice).split('\n');
    expect(lines.slice(-3)).toEqual([
      '    Y sư mira viết:',
      '      Removed `let unused;`.',
      '      src/other.ts needed a rename too.',
    ]);
    expect(lineOf(en, { kind: 'infirmary', quest, reason, trip: 'commit' })).not.toContain('wrote:');
  });

  it('does not say again the script its reason named', () => {
    const reason = { code: 'script:fail', params: { script: 'link-check' } } as const;
    const notice: Notice = { kind: 'infirmary', quest, reason, trip: 'script_fail', detail: { script: 'x' } };
    expect(lineOf(en, notice)).toBe(
      'Quest q_20261106_7k3m2a «Đổi luồng đăng nhập» went to the infirmary: the script link-check ran but did not pass',
    );
  });
});

describe('the console bell on a merge that stopped (PS-08e)', () => {
  const quest = { id: QuestIdSchema.parse('q_20261115_m3m3m3'), title: 'Book a room', rank: 'C' } as const;
  const stopped = { kind: 'merge_stopped', quest, branch: 'main' } as const;

  it('names the conflicted files for the knight, and what the owner looks at otherwise', () => {
    expect(lineOf(en, { ...stopped, reason: 'conflict', conflicts: ['README.md', 'src/a.ts'] })).toBe(
      'Merge quest q_20261115_m3m3m3 «Book a room»: merging main stopped on a conflict in README.md, src/a.ts. ' +
        "The merge waits in its plot; a knight concludes it in the quest's next run.",
    );
    expect(lineOf(en, { ...stopped, reason: 'refused', conflicts: [] })).toContain(
      'git or a hook refused to merge main.',
    );
    expect(lineOf(en, { ...stopped, reason: 'missing', conflicts: [] })).toContain(
      'there is no branch main to merge',
    );
    expect(lineOf(vi, { ...stopped, reason: 'conflict', conflicts: ['README.md'] })).toBe(
      'Quest ghép q_20261115_m3m3m3 «Book a room»: ghép main dừng vì xung đột ở README.md. ' +
        'Lần ghép dở để nguyên trong đất; một hiệp sĩ gỡ nó ở lượt kế của nhiệm vụ.',
    );
  });

  it("names the merge queue's merge quest as quest show does, not as a party's (run (221) (e))", () => {
    const queued = { ...stopped, queue: true, reason: 'conflict', conflicts: ['src/plan-tick.ts'] } as const;
    expect(lineOf(vi, queued)).toMatch(/^Quest Hợp nhất q_20261115_m3m3m3 «Book a room»: ghép main dừng/);
    expect(lineOf(en, queued)).toMatch(/^Queue merge quest q_20261115_m3m3m3 «Book a room»: merging main/);
    expect(lineOf(vi, { ...queued, reason: 'refused', conflicts: [] })).toMatch(/^Quest Hợp nhất /);
    expect(lineOf(vi, { ...queued, reason: 'missing', conflicts: [] })).toMatch(/^Quest Hợp nhất /);
  });
});

describe('the console bell on a delivery to the forge (PS-08c)', () => {
  const quest = { id: QuestIdSchema.parse('q_20261116_aaaaa1'), title: 'Book a room', rank: 'C' } as const;
  const url = 'https://github.com/elvaria-specs/kingdom-repo/pull/7';

  it('names the open pull request, and the files a secret pattern matched', () => {
    expect(lineOf(en, { kind: 'delivery_pushed', quest, url, warnings: [] })).toBe(
      `Quest q_20261116_aaaaa1 «Book a room»: branch pushed, pull request open: ${url}`,
    );
    expect(lineOf(en, { kind: 'delivery_pushed', quest, url, warnings: ['src/a.ts', 'b.env'] })).toBe(
      `Quest q_20261116_aaaaa1 «Book a room»: branch pushed, pull request open: ${url}. Added lines match a ` +
        'shared secret pattern in src/a.ts, b.env: look at them before you merge.',
    );
  });

  it('says where the delivery stopped, why, and the command that sends it again', () => {
    expect(lineOf(en, { kind: 'delivery_failed', quest, stage: 'open', reason: 'forge_auth' })).toBe(
      'Quest q_20261116_aaaaa1 «Book a room»: the delivery stopped at opening the pull request: the forge refused ' +
        'the credential (expired, revoked, no push access, or SSO); sign in again, then deliver again. Deliver ' +
        'again: elvaria quest deliver q_20261116_aaaaa1',
    );
    expect(lineOf(vi, { kind: 'delivery_failed', quest, stage: 'scan', reason: 'secret' })).toContain(
      'elvaria quest deliver q_20261116_aaaaa1',
    );
  });

  it('names the merge quest that resolves the stop, for the seal (PS-09b)', () => {
    const merge = QuestIdSchema.parse('q_20261116_m3m3m3');
    const notice = {
      kind: 'delivery_failed',
      quest,
      stage: 'update',
      reason: 'conflict',
      merge_quest: merge,
    } as const;
    expect(lineOf(en, notice)).toBe(
      'Quest q_20261116_aaaaa1 «Book a room»: the delivery stopped at the update of the branch (the base branch ' +
        'merged in, the generators, every check); the merge quest q_20261116_m3m3m3 resolves it, for your seal.',
    );
    expect(lineOf(vi, notice)).not.toContain('quest deliver');
  });
});

describe('the console bell on a quest that waits for a judge who reads images (PS-11)', () => {
  const quest = { id: QuestIdSchema.parse('q_20261106_7k3m2a'), title: 'Đổi nút', rank: 'C' as const };
  const notice = { kind: 'unjudgeable', quest, classes: ['judge'], model: 'claude-sonnet-5-5' } as const;

  it('names the tribe it needs, not only another model', () => {
    expect(lineOf(en, { ...notice, vision: true })).toBe(
      'Quest q_20261106_7k3m2a «Đổi nút» waits in review for a judge who reads images, but no judge of the ' +
        'kingdom may judge it: the judge must be of a tribe whose CLI reads images (its adapter declares vision), ' +
        'must not have worked on it and must run another model than claude-sonnet-5-5. ' +
        'Summon one: elvaria character add <id> --class judge --tribe <tribe>',
    );
    expect(lineOf(vi, { ...notice, vision: true })).toContain('chờ một người chấm đọc được ảnh');
    expect(lineOf(en, notice)).toContain(
      'Summon one: elvaria character add <id> --class judge --model <model>',
    );
  });
});
