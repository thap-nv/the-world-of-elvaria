// docs/tier-report.md: what each of the three tiers did and cost, from a kingdom's event log (implementation-plan
// §3.12, ADR 0017), for the owner to tune kingdom.json after a few weeks (breakers.subagent_max_turns,
// subagent_max_minutes, context_budget_tokens). Unlike the other generated docs it comes from a kingdom, not from the
// repo: `pnpm docs:gen --kingdom <dir>` writes it, and `pnpm docs:gen --check` without a kingdom leaves it alone.
// An apprentice's tokens are inside its session's (`modelUsage` adds them up, spike P1-02), so the apprentice tier
// counts runs, minutes, cuts and overruns, never tokens of its own.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { EventSchema } from '@elvaria/domain';

import { code, markdownDocument, table } from './docs-markdown.mjs';

export const TIER_REPORT_FILE = 'docs/tier-report.md';

/** @typedef {import('@elvaria/domain').Event} Event */
/** @typedef {Record<string, unknown>} Json */
/**
 * @typedef {{
 *   id: string; tier: string; kind: string; status: string; runs: number; sessions: number; tokens: number;
 *   turns: number; apprentices: number; apprentice_ms: number; cut: number; overruns: number;
 *   apprentice_calls: number; own_calls: number;
 * }} QuestStats
 */

const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.jsonl$/;
const MS_PER_MINUTE = 60_000;
const PERCENT = 100;

/** @param {unknown} value @returns {value is Json} */
const isJson = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/** @param {unknown} value */
const count = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** @param {string} line @returns {Event[]} */
function eventOf(line) {
  if (line.trim() === '') return [];
  try {
    const parsed = EventSchema.safeParse(JSON.parse(line));
    return parsed.success ? [parsed.data] : [];
  } catch {
    return [];
  }
}

/**
 * Every valid line of `<kingdom>/events/<day>.jsonl`, day by day. The sandbox's fake days (events/sandbox/) are not
 * the kingdom's work, and a line the schema refuses is left out, as every reader of the log does.
 * @param {string} kingdom
 * @returns {Event[]}
 */
export function readKingdomEvents(kingdom) {
  const dir = path.join(kingdom, 'events');
  const days = readdirSync(dir)
    .filter((name) => DAY_FILE.test(name))
    .sort();
  return days.flatMap((day) => readFileSync(path.join(dir, day), 'utf8').split('\n').flatMap(eventOf));
}

/** @param {string} id @returns {QuestStats} */
const blank = (id) => ({
  id,
  tier: '?',
  kind: '?',
  status: '?',
  runs: 0,
  sessions: 0,
  tokens: 0,
  turns: 0,
  apprentices: 0,
  apprentice_ms: 0,
  cut: 0,
  overruns: 0,
  apprentice_calls: 0,
  own_calls: 0,
});

/** What one line adds to its quest's numbers, by type. @type {Readonly<Record<string, (q: QuestStats, data: Json) => void>>} */
const ADD = {
  'quest.started': (q) => {
    q.runs += 1;
  },
  'agent.session.end': (q, data) => {
    const usage = isJson(data.usage) ? data.usage : {};
    q.sessions += 1;
    q.tokens += count(usage.tokens);
    q.turns += count(usage.turns);
  },
  'agent.subagent.end': (q, data) => {
    q.apprentices += 1;
    q.apprentice_ms += count(data.duration_ms);
    if (data.stopped === 'max_turns') q.cut += 1;
  },
  'agent.subagent.overrun': (q) => {
    q.overruns += 1;
  },
  'agent.tool': (q, data) => {
    if (typeof data.agent_type === 'string') q.apprentice_calls += 1;
    else q.own_calls += 1;
  },
};

/** The last view of the quest a quest line carries: its tier, kind and status now. @param {QuestStats} q @param {Json} data */
function seeView(q, data) {
  const view = data.quest;
  if (!isJson(view)) return;
  q.tier = String(view.tier);
  q.kind = String(view.kind);
  q.status = String(view.status);
}

/**
 * Numbers per quest, in the order quests first appear; `''` keys what ran for no quest (the Chancellor).
 * @param {readonly Event[]} events
 * @returns {QuestStats[]}
 */
export function questStatsOf(events) {
  /** @type {Map<string, QuestStats>} */
  const quests = new Map();
  for (const event of events) {
    const id = event.quest ?? '';
    const q = quests.get(id) ?? blank(id);
    quests.set(id, q);
    if (event.type.startsWith('quest.')) seeView(q, event.data);
    ADD[event.type]?.(q, event.data);
  }
  return [...quests.values()];
}

/** @param {readonly QuestStats[]} stats @param {(q: QuestStats) => number} pick */
const sum = (stats, pick) => stats.reduce((total, q) => total + pick(q), 0);
/** @param {number} ms */
const minutes = (ms) => (ms / MS_PER_MINUTE).toFixed(1);
/** @param {number} part @param {number} whole */
const share = (part, whole) => (whole === 0 ? '—' : `${Math.round((part / whole) * PERCENT)} %`);

/** @param {readonly QuestStats[]} quests */
function tierTable(quests) {
  const script = quests.filter(({ tier }) => tier === 'script');
  const session = quests.filter(({ tier }) => tier === 'session');
  const apprentices = sum(quests, (q) => q.apprentices);
  return table(
    ['Bậc', 'Quest', 'Lần chạy', 'Phiên', 'Token', 'Ghi chú'],
    [
      ['Script', String(script.length), String(sum(script, (q) => q.runs)), '0', '0', 'không model, mana 0'],
      [
        'Học đồ',
        '—',
        String(apprentices),
        '—',
        'trong phiên',
        `${minutes(sum(quests, (q) => q.apprentice_ms))} phút; ${sum(quests, (q) => q.cut)} lần bị cắt ở maxTurns; ${sum(quests, (q) => q.overruns)} lần quá giờ; ${sum(quests, (q) => q.apprentice_calls)} lời gọi tool`,
      ],
      [
        'Phiên',
        String(session.length),
        String(sum(session, (q) => q.runs)),
        String(sum(session, (q) => q.sessions)),
        String(sum(session, (q) => q.tokens)),
        `${sum(session, (q) => q.turns)} lượt; ${sum(session, (q) => q.own_calls)} lời gọi tool của nhân vật`,
      ],
    ],
  );
}

/** @param {readonly QuestStats[]} quests */
function questTable(quests) {
  return table(
    ['Quest', 'Bậc', 'Dạng', 'Trạng thái', 'Lần chạy', 'Phiên', 'Token', 'Học đồ', 'Bị cắt', 'Quá giờ'],
    quests.map((q) => [
      code(q.id),
      q.tier,
      q.kind,
      q.status,
      String(q.runs),
      String(q.sessions),
      String(q.tokens),
      String(q.apprentices),
      String(q.cut),
      String(q.overruns),
    ]),
  );
}

/**
 * The report, from the kingdom's lines in the order they were written.
 * @param {readonly Event[]} events
 */
export function renderTierReport(events) {
  const all = questStatsOf(events);
  const quests = all.filter(({ id }) => id !== '');
  const outside = all.find(({ id }) => id === '');
  const sessions = sum(quests, (q) => q.sessions);
  const withApprentice = quests.filter(({ apprentices }) => apprentices > 0).length;
  const span = events.length === 0 ? 'chưa có dòng nào' : `${events[0]?.ts} → ${events.at(-1)?.ts}`;
  return markdownDocument([
    '# Ba bậc chạy việc: số đo',
    `> Sinh từ event log của một vương quốc bằng ${code('pnpm docs:gen --kingdom <thư mục>')}; không sửa file này. Số đo để chỉnh ${code('kingdom.json')} (${code('breakers.subagent_max_turns')}, ${code('subagent_max_minutes')}, ${code('context_budget_tokens')}): implementation-plan §3.12, ADR 0017.`,
    `Khoảng: ${span}; ${events.length} dòng event, ${quests.length} quest.`,
    '## Theo bậc',
    tierTable(quests),
    `Tỉ lệ: ${share(quests.filter(({ tier }) => tier === 'script').length, quests.length)} quest bậc script; ${share(withApprentice, quests.length)} quest có học đồ; ${sum(quests, (q) => q.apprentices)} lần học đồ trên ${sessions} phiên. Token của học đồ đã nằm trong token của phiên (${code('modelUsage')} gộp). Ngoài quest (Tể tướng): ${outside?.sessions ?? 0} phiên, ${outside?.tokens ?? 0} token.`,
    '## Theo quest',
    quests.length === 0 ? 'Chưa có quest nào.' : questTable(quests),
  ]);
}
