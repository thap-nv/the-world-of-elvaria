// docs/metrics-report.md: the metrics ledger of a kingdom (implementation-plan §3.16.1, ADR 0027), so a fix to the
// machinery can be checked against the rework it was meant to remove. Like docs/tier-report.md it comes from a
// kingdom, not from the repo: `pnpm docs:gen --kingdom <dir>` writes it, `pnpm docs:gen --check` without a kingdom
// leaves it alone. It reads the kingdom with the reader of `elvaria metrics` and says it with the same sections and
// the same strings (Vietnamese, as every doc in docs/), plus a table by day.
import { dayOf, metricsOf } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';

import { readMetricsSource } from '../apps/cli/src/metrics/read.ts';
import { daysSection, metricsSections } from '../apps/cli/src/metrics/view.ts';

import { code, markdownDocument, table } from './docs-markdown.mjs';

export const METRICS_REPORT_FILE = 'docs/metrics-report.md';

/** @typedef {import('@elvaria/domain').MetricsInput} MetricsInput */
/** @typedef {import('../apps/cli/src/metrics/view.ts').MetricsSection} MetricsSection */

/**
 * The days on which a session or a machine run started, oldest first.
 * @param {MetricsInput} input
 */
export function daysOf(input) {
  const days = input.quests.flatMap((quest) => quest.attempt_log.map(({ started_at }) => dayOf(started_at)));
  return [...new Set(days)].sort();
}

/** @param {MetricsSection} section */
const sectionBlocks = (section) => [
  `## ${section.title}`,
  ...(section.lines.length === 0 ? [] : [section.lines.join('\n\n')]),
  ...(section.table === undefined ? [] : [table(section.table.header, section.table.rows)]),
];

/**
 * The report over the whole kingdom, from what the reader found; `skipped` names what it could not read.
 * @param {MetricsInput} input
 * @param {readonly string[]} skipped
 */
export function renderMetricsReport(input, skipped = []) {
  const t = translator('vi');
  const days = daysOf(input).map((day) => ({ day, metrics: metricsOf(input, { since: day, until: day }) }));
  const [summary, ...rest] = metricsSections(t, metricsOf(input));
  const note = `> Sinh từ một vương quốc bằng ${code('pnpm docs:gen --kingdom <thư mục>')}; không sửa file này. Cùng số với ${code('elvaria metrics')} (implementation-plan §3.16.1, ADR 0027).`;
  const { events } = input;
  const span = events.length === 0 ? 'chưa có dòng nào' : `${events[0]?.ts} → ${events.at(-1)?.ts}`;
  const read = `Khoảng: ${span}; ${events.length} dòng event, ${input.quests.length} quest, ${input.verdicts.length} phán quyết, ${input.commands.length} lệnh đã xử lý.`;
  const unread =
    skipped.length === 0
      ? []
      : [`Bỏ qua ${skipped.length} file hay dòng không đọc được: ${skipped.map(code).join(', ')}.`];
  return markdownDocument([
    '# Sổ đo',
    note,
    read,
    ...unread,
    ...(summary === undefined ? [] : sectionBlocks(summary)),
    ...sectionBlocks(daysSection(t, days)),
    ...rest.flatMap(sectionBlocks),
  ]);
}

/** @param {string} kingdom */
export async function metricsReportOf(kingdom) {
  const { input, skipped } = await readMetricsSource(kingdom);
  return renderMetricsReport(input, skipped);
}
