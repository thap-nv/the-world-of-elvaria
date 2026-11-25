import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { QuestSchema } from '@elvaria/domain';
import type { MetricsInput, Quest } from '@elvaria/domain';
import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { daysOf, metricsReportOf, renderMetricsReport } from './docs-metrics-report.mjs';

const QUEST = 'q_20261108_000001';

const entry = (n: number, role: 'assignee' | 'verifier', day: string, hour: number) => ({
  n,
  character: role === 'assignee' ? 'thorn' : 'vesper',
  role,
  started_at: `${day}T0${hour}:00:00+07:00`,
  ended_at: `${day}T0${hour}:30:00+07:00`,
  outcome: role === 'verifier' && n === 1 ? 'breaker' : 'submitted',
  run_dir: role === 'verifier' ? `.runs/${QUEST}-${n}/verify` : `.runs/${QUEST}-${n}`,
});

/** A judge a breaker cut on 2026-11-08, the next judge on 2026-11-09. */
const quest: Quest = QuestSchema.parse({
  version: 1,
  id: QUEST,
  title: 'Thêm script pnpm check',
  description: 'Gom lint, typecheck và test thành một lệnh.',
  kind: 'build',
  rank: 'E',
  territory: 'dc1-se-team',
  class_required: 'knight',
  tags: ['infra'],
  status: 'review',
  tier: 'session',
  assignee: 'thorn',
  verifier: 'vesper',
  budget: { max_minutes: 45, max_tokens: 400000, max_attempts: 3 },
  estimate: { tokens: 200000, minutes: 30 },
  attempts: 1,
  attempt_log: [
    entry(1, 'assignee', '2026-11-08', 1),
    entry(1, 'verifier', '2026-11-08', 2),
    entry(1, 'verifier', '2026-11-09', 3),
  ],
  plot: { type: 'none' },
  deliverable: { type: 'branch' },
  seal_required: false,
  created_by: 'user',
  created_at: '2026-11-08T01:00:00+07:00',
  updated_at: '2026-11-08T01:00:00+07:00',
});

const INPUT: MetricsInput = { quests: [quest], verdicts: [], events: [], commands: [] };

describe('daysOf', () => {
  it('lists each day a run started, oldest first, once', () => {
    expect(daysOf(INPUT)).toEqual(['2026-11-08', '2026-11-09']);
  });
});

describe('renderMetricsReport', () => {
  it('shows the summary, a row per day and the sections of elvaria metrics, in Vietnamese', () => {
    const report = renderMetricsReport(INPUT);
    expect(report.startsWith('# Sổ đo\n')).toBe(true);
    expect(report).toContain(
      'Khoảng: chưa có dòng nào; 0 dòng event, 1 quest, 0 phán quyết, 0 lệnh đã xử lý.',
    );
    expect(report).toContain('## Sổ đo (toàn bộ vương quốc)');
    expect(report).toContain('Làm lại: 1 phiên (hạ tầng 1, đầu ra 0, câu hỏi 0, không rõ 0).');
    expect(report).toContain('| 2026-11-08 | 2 | 0 (0/0/0/0) | 0/0 | 0 |');
    expect(report).toContain('| 2026-11-09 | 1 | 1 (1/0/0/0) | 0/0 | 0 |');
    expect(report).toContain('| hạ tầng | kết thúc phiên | breaker | 0 | 1 | 1 |');
    expect(report).toContain('## Giới hạn đã biết');
    expect(report).not.toContain('Bỏ qua');
    expect(report.endsWith('\n')).toBe(true);
  });

  it('has the three lesson tables of PS-12b, empty, in Vietnamese', () => {
    const report = renderMetricsReport(INPUT);
    expect(report).toContain('## Bài học trong kinh: lượt nạp, trúng, trượt và tác dụng');
    expect(report).toContain('Chưa phiên nào ghi dấu vết nạp theo dòng');
    expect(report).toContain(
      '## Loại lỗi theo thời gian (số lượt trượt trên số lượt được chấm, mỗi khoảng 20 lượt)',
    );
    expect(report).toContain('## Lỗi lặp trong 50 lượt được chấm gần nhất (từ 3 phán quyết cùng loại)');
  });

  it('joins the sentence of a line of the scriptures into its row, by ref', () => {
    const ref = 'L_20261108_4k2pqz';
    const first = {
      v: 1,
      id: '01JC0000000000000000000001',
      ts: '2026-11-08T01:00:00+07:00',
      type: 'quest.started',
      actor: { kind: 'steward' },
      quest: QUEST,
      session: 's-1',
      data: {
        quest: { id: QUEST, status: 'working', attempts: 1 },
        load_trace: {
          scriptures: [],
          skills: [],
          blocks: [{ part: 'user', id: 'quest', chars: 1 }],
          lessons: [ref],
        },
      },
    } as unknown as MetricsInput['events'][number];
    const input = { ...INPUT, events: [first] };
    const report = renderMetricsReport(input, [], new Map([[ref, 'Keep the README in step with the code.']]));
    expect(report).toMatch(
      new RegExp(
        `\\| ${ref} \\| — \\| 1 \\| 0 \\| 0 \\| — \\| 2026-11-08 \\| 2026-11-08 \\| Keep the README`,
      ),
    );
  });

  it('names what the reader skipped', () => {
    expect(renderMetricsReport(INPUT, ['inbox/done/torn.json: not JSON'])).toContain(
      'Bỏ qua 1 file hay dòng không đọc được: `inbox/done/torn.json: not JSON`.',
    );
  });
});

describe('the report from a kingdom on disk', () => {
  let kingdom: string;
  let temp: TempDir;
  beforeEach(async () => {
    temp = await tempDir('elvaria metrics');
    kingdom = temp.root;
    await mkdir(path.join(kingdom, 'quests'), { recursive: true });
    await mkdir(path.join(kingdom, 'events'), { recursive: true });
    await writeFile(path.join(kingdom, 'quests', `${QUEST}.json`), JSON.stringify(quest), 'utf8');
    const line = {
      v: 1,
      id: '01JC0000000000000000000001',
      ts: '2026-11-08T01:00:00+07:00',
      type: 'mana.probe',
      actor: { kind: 'steward' },
      data: {},
    };
    await writeFile(path.join(kingdom, 'events', '2026-11-08.jsonl'), `${JSON.stringify(line)}\n`, 'utf8');
  });
  afterEach(() => temp.remove());

  it('reads the kingdom with the reader of elvaria metrics', async () => {
    const report = await metricsReportOf(kingdom);
    expect(report).toContain('Lượt: 3 (3 phiên của nhân vật, 0 lượt của máy)');
    expect(report).toContain(
      'Khoảng: 2026-11-08T01:00:00+07:00 → 2026-11-08T01:00:00+07:00; 1 dòng event, 1 quest',
    );
  });
});
