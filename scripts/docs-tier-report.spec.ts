import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { kingdomGenerators, run } from './docs-gen.mjs';
import { TIER_REPORT_FILE, questStatsOf, readKingdomEvents, renderTierReport } from './docs-tier-report.mjs';

const SCRIPT_QUEST = 'q_20261107_s1c7p0';
const SESSION_QUEST = 'q_20261107_a1b2c3';
const AT = '2026-11-07T10:00:00+07:00';

/** A quest view as the Steward's lines carry it (domain QuestViewSchema). */
const view = (id: string, tier: 'script' | 'session', status: string) => ({
  id,
  title: `Quest ${id.slice(-6)}`,
  kind: tier === 'script' ? 'batch' : 'build',
  rank: 'D',
  territory: 'dc1',
  status,
  tier,
  class_required: tier === 'script' ? null : 'knight',
  tags: ['docs'],
  assignee: tier === 'script' ? null : 'thorn',
  verifier: null,
  attempts: 1,
  max_attempts: 3,
  seal_required: false,
  sealed_at: null,
  question: null,
  party_id: null,
  party_role: null,
  campaign_id: null,
  parent_id: null,
  depends_on: [],
  delivered_at: null,
  created_at: AT,
  updated_at: AT,
});

let counter = 0;
const line = (type: string, data: Record<string, unknown>, quest?: string) => {
  counter += 1;
  return {
    v: 1,
    id: `01JC0000000000000000000${String(counter).padStart(3, '0')}`,
    ts: `2026-11-07T10:${String(counter).padStart(2, '0')}:00+07:00`,
    type,
    actor: { kind: 'steward' },
    ...(quest === undefined ? {} : { quest }),
    data,
  };
};

/** A morning's work: a link check run as a script, a build with an apprentice, and the Chancellor's session. */
const DAY = [
  line('quest.started', { quest: view(SCRIPT_QUEST, 'script', 'working') }, SCRIPT_QUEST),
  line('quest.done', { quest: view(SCRIPT_QUEST, 'script', 'done') }, SCRIPT_QUEST),
  line('agent.session.end', { outcome: 'completed', usage: { tokens: 6400, turns: 2 } }),
  line('quest.started', { quest: view(SESSION_QUEST, 'session', 'working') }, SESSION_QUEST),
  line('agent.tool', { tool: 'read', path: 'src/a.ts' }, SESSION_QUEST),
  line('agent.tool', { tool: 'read', path: 'src/b.ts', agent_type: 'apprentice' }, SESSION_QUEST),
  line(
    'agent.subagent.end',
    { agent_type: 'apprentice', duration_ms: 330_000, stopped: 'max_turns' },
    SESSION_QUEST,
  ),
  line(
    'agent.subagent.overrun',
    { agent_type: 'apprentice', duration_ms: 330_000, limit_minutes: 5 },
    SESSION_QUEST,
  ),
  line('agent.session.end', { outcome: 'completed', usage: { tokens: 52_000, turns: 31 } }, SESSION_QUEST),
  line('quest.submitted', { quest: view(SESSION_QUEST, 'session', 'review') }, SESSION_QUEST),
];

describe('questStatsOf', () => {
  it('adds up runs, sessions, tokens and apprentices per quest, the Chancellor apart', () => {
    const stats = questStatsOf(DAY as never);
    expect(stats.map(({ id }) => id)).toEqual([SCRIPT_QUEST, '', SESSION_QUEST]);
    expect(stats[0]).toMatchObject({ tier: 'script', status: 'done', runs: 1, sessions: 0, tokens: 0 });
    expect(stats[1]).toMatchObject({ sessions: 1, tokens: 6400 });
    expect(stats[2]).toMatchObject({
      tier: 'session',
      status: 'review',
      runs: 1,
      sessions: 1,
      tokens: 52_000,
      turns: 31,
      apprentices: 1,
      apprentice_ms: 330_000,
      cut: 1,
      overruns: 1,
      apprentice_calls: 1,
      own_calls: 1,
    });
  });
});

describe('renderTierReport', () => {
  it('shows the three tiers, their share and each quest', () => {
    const report = renderTierReport(DAY as never);
    expect(report).toContain('| Script | 1 | 1 | 0 | 0 | không model, mana 0 |');
    expect(report).toContain(
      '| Học đồ | — | 1 | — | trong phiên | 5.5 phút; 1 lần bị cắt ở maxTurns; 1 lần quá giờ; 1 lời gọi tool |',
    );
    expect(report).toContain('| Phiên | 1 | 1 | 1 | 52000 | 31 lượt; 1 lời gọi tool của nhân vật |');
    expect(report).toContain(
      'Tỉ lệ: 50 % quest bậc script; 50 % quest có học đồ; 1 lần học đồ trên 1 phiên.',
    );
    expect(report).toContain('Ngoài quest (Tể tướng): 1 phiên, 6400 token.');
    expect(report).toContain(
      `| \`${SESSION_QUEST}\` | session | build | review | 1 | 1 | 52000 | 1 | 1 | 1 |`,
    );
    expect(report.endsWith('|\n')).toBe(true);
  });

  it('says so when the log is empty', () => {
    const report = renderTierReport([]);
    expect(report).toContain('Khoảng: chưa có dòng nào; 0 dòng event, 0 quest.');
    expect(report).toContain('Tỉ lệ: — quest bậc script');
    expect(report).toContain('Chưa có quest nào.');
  });
});

describe('the report from a kingdom on disk', () => {
  let kingdom: string;
  beforeEach(async () => {
    kingdom = await mkdtemp(path.join(tmpdir(), 'elvaria tiers '));
    await mkdir(path.join(kingdom, 'events', 'sandbox'), { recursive: true });
    const jsonl = (lines: readonly unknown[]) =>
      `${lines.map((entry) => JSON.stringify(entry)).join('\n')}\n`;
    await writeFile(
      path.join(kingdom, 'events', '2026-11-07.jsonl'),
      `${jsonl(DAY)}not json\n{"v":2}\n`,
      'utf8',
    );
    // A fake day of the sandbox is not the kingdom's work.
    await writeFile(path.join(kingdom, 'events', 'sandbox', '2026-11-07.jsonl'), jsonl(DAY), 'utf8');
    await writeFile(path.join(kingdom, 'events', 'notes.txt'), 'not a day', 'utf8');
  });
  afterEach(() => rm(kingdom, { recursive: true, force: true }));

  it("reads the kingdom's own days, line by line, and leaves out lines the schema refuses", () => {
    expect(readKingdomEvents(kingdom)).toHaveLength(DAY.length);
  });

  it('is generated by docs:gen only when a kingdom is named', async () => {
    expect(kingdomGenerators(['--check'])).toEqual([]);
    expect(kingdomGenerators(['--kingdom='])).toEqual([]);
    expect(kingdomGenerators([`--kingdom=${kingdom}`]).map(({ file }) => file)).toEqual([TIER_REPORT_FILE]);
    const written: Record<string, string> = {};
    const repo = {
      read: () => undefined,
      write: (file: string, text: string) => void (written[file] = text),
    };
    expect(await run(['--kingdom', kingdom], repo, [])).toEqual({
      code: 0,
      text: 'docs:gen: 1 generated docs, 1 written',
    });
    expect(written[TIER_REPORT_FILE]).toContain('# Ba bậc chạy việc: số đo');
  });
});
