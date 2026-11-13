// `elvaria metrics [--since <day>] [--until <day>] [--json]`: the metrics ledger of the kingdom (implementation-plan
// §3.16.1, ADR 0027). It only reads files, so it runs beside a Steward or without one, and spends no mana. (PS-06b)
// `--plan <quest>`: instead of the ledger, how a plan quest's sub-quests went against its plan (§3.16.6).
import { metricsOf, planAccuracyOf } from '@elvaria/domain';
import type { MetricsWindow } from '@elvaria/domain';

import { flagOption, textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { renderTable } from '../table.ts';
import { readMetricsSource } from './read.ts';
import { planSections } from './view-plan.ts';
import { metricsSections } from './view.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { MetricsSource } from './read.ts';
import type { MetricsSection } from './view.ts';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const JSON_INDENT = 2;

/** A real calendar day as `yyyy-mm-dd`: 2026-13-01 does not parse, and 2026-02-30 parses as 2026-03-02. */
function isDay(value: string): boolean {
  const ms = DAY.test(value) ? Date.parse(`${value}T00:00:00Z`) : Number.NaN;
  return !Number.isNaN(ms) && new Date(ms).toISOString().startsWith(value);
}

/** The window the options ask for, or the line that says why they are wrong. */
function windowOf(input: CommandInput, cli: CliContext): MetricsWindow | string {
  const since = textOption(input, 'since');
  const until = textOption(input, 'until');
  for (const [option, value] of [
    ['--since', since],
    ['--until', until],
  ] as const) {
    if (value !== undefined && !isDay(value)) return cli.t('cli.metrics.bad_day', { option, value });
  }
  if (since !== undefined && until !== undefined && since > until)
    return cli.t('cli.metrics.bad_range', { since, until });
  return { ...(since === undefined ? {} : { since }), ...(until === undefined ? {} : { until }) };
}

function printSections(cli: CliContext, sections: readonly MetricsSection[]): void {
  sections.forEach((section, index) => {
    if (index > 0) cli.io.out('');
    cli.io.out(section.title);
    section.lines.forEach(cli.io.out);
    if (section.table !== undefined)
      renderTable([section.table.header, ...section.table.rows]).forEach(cli.io.out);
  });
}

/** The plan's accuracy, or the usage error of a quest that is not there or is no plan (PS-06b). */
function printPlan(input: CommandInput, ctx: CliContext, source: MetricsSource, id: string): ExitCode {
  const accuracy = planAccuracyOf(source.input, id);
  if (!accuracy.ok) {
    const { error } = accuracy;
    ctx.io.err(
      error.code === 'unknown_quest'
        ? ctx.t('cli.quest.unknown_quest', { id })
        : ctx.t('cli.metrics.plan.not_a_plan', { id, deliverable: error.deliverable }),
    );
    return EXIT.usage;
  }
  if (flagOption(input, 'json') === true) ctx.io.out(JSON.stringify(accuracy.value, null, JSON_INDENT));
  else printSections(ctx, planSections(ctx.t, accuracy.value));
  return EXIT.ok;
}

async function runMetrics(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const window = windowOf(input, ctx);
  if (typeof window === 'string') {
    ctx.io.err(window);
    return EXIT.usage;
  }
  const plan = textOption(input, 'plan');
  // A plan is read over its whole life: its parts run on days of their own.
  if (plan !== undefined && Object.keys(window).length > 0) {
    ctx.io.err(ctx.t('cli.metrics.plan.window'));
    return EXIT.usage;
  }
  const source = await readMetricsSource(ctx.store.root);
  for (const where of source.skipped) ctx.io.err(ctx.t('cli.metrics.skipped', { where }));
  if (plan !== undefined) return printPlan(input, ctx, source, plan);
  const metrics = metricsOf(source.input, window);
  if (flagOption(input, 'json') === true) ctx.io.out(JSON.stringify(metrics, null, JSON_INDENT));
  else printSections(ctx, metricsSections(ctx.t, metrics));
  return EXIT.ok;
}

export const METRICS: CommandSpec = {
  name: ['metrics'],
  summary: 'cli.metrics.summary',
  args: [],
  options: {
    since: { type: 'string', value: '<yyyy-mm-dd>', help: 'cli.metrics.option.since' },
    until: { type: 'string', value: '<yyyy-mm-dd>', help: 'cli.metrics.option.until' },
    json: { type: 'boolean', help: 'cli.metrics.option.json' },
    plan: { type: 'string', value: '<quest>', help: 'cli.metrics.option.plan' },
  },
  run: runMetrics,
};
