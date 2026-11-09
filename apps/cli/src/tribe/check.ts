// `elvaria tribe check <id> [--scenarios] [--model <slug>]` (implementation-plan §3.14, ADR 0021): the conformance
// suite of runner-core against the tribe's runner, built from its adapter as `elvaria run` builds it, plus the sign-in
// kingdom.json pins against the ones the adapter declares (checkTribeAuth, P1-19). A tribe that passes is enabled; one
// that fails stays as it is. With the real CLI only the checks that burn no or almost no mana run (a tiny job, a
// forbidden push, a kill, the probe); `--scenarios` runs them all against a fake CLI that plays the suite's scenarios
// from ELVARIA_FAKE_SCENARIO, as the specs' do.
import { ADAPTER_CAPABILITIES, tribeLimitsOf } from '@elvaria/domain';
import type { AdapterCapabilities, Tribe } from '@elvaria/domain';
import { runConformance } from '@elvaria/runner-core';
import type { AgentRunner, ConformanceReport } from '@elvaria/runner-core';

import { flagOption, textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { authFindings } from '../doctor/check-tribe.ts';
import { findingLines } from '../doctor/finding.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { minimalEnv } from '../process/minimal-env.ts';
import { handOf } from '../run/crew.ts';
import { namedTribe, setEnabled } from './save.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** How long one session of the suite may take to answer: a real CLI starts slowly, a hang is killed long before. */
const SESSION_TIMEOUT_MS = 120_000;

/** What the adapter declares and how far tribeLimitsOf lets the tribe go. */
function capabilityLines(ctx: KingdomContext, tribe: Tribe, caps: AdapterCapabilities): string[] {
  const declared = ADAPTER_CAPABILITIES.filter((name) => caps[name]);
  const missing = ADAPTER_CAPABILITIES.filter((name) => !caps[name]);
  const limits = tribeLimitsOf(caps);
  const params = { tribe: tribe.id, adapter: tribe.adapter, auth: caps.auth.join(', ') };
  return [
    ctx.t('cli.tribe.check.declared', { ...params, capabilities: declared.join(', ') }),
    ...(missing.length === 0 ? [] : [ctx.t('cli.tribe.check.missing', { capabilities: missing.join(', ') })]),
    ctx.t('cli.tribe.check.max_rank', { rank: limits.max_rank }),
    ...(limits.guarded_zones ? [] : [ctx.t('cli.tribe.check.no_guarded')]),
  ];
}

function reportLine(ctx: KingdomContext, report: ConformanceReport): string {
  if (report.outcome === 'passed') return ctx.t('cli.tribe.check.passed_check', { check: report.id });
  if (report.outcome === 'skipped') return ctx.t('cli.tribe.check.skipped_check', { check: report.id });
  return ctx.t('cli.tribe.check.failed_check', { check: report.id, problem: report.problem ?? '' });
}

/** The suite against `runner`: true when no check failed. */
async function conforms(ctx: KingdomContext, input: CommandInput, tribe: Tribe, runner: AgentRunner) {
  const model = textOption(input, 'model') ?? tribe.tool?.default_model;
  const reports = await runConformance({
    name: tribe.id,
    createRunner: () => runner,
    live: flagOption(input, 'scenarios') !== true,
    env: minimalEnv(ctx.io.env),
    timeout_ms: SESSION_TIMEOUT_MS,
    ...(model === undefined ? {} : { model }),
  });
  reports.forEach((report) => {
    ctx.io.out(reportLine(ctx, report));
  });
  return reports.every(({ outcome }) => outcome !== 'failed');
}

/** Enables a passing tribe: only once doctor has pinned its CLI, as `doctor --enable` asks (P1-15). */
async function enable(ctx: KingdomContext, tribe: Tribe): Promise<ExitCode> {
  if (tribe.enabled) {
    ctx.io.out(ctx.t('cli.tribe.check.passed', { tribe: tribe.id }));
    return EXIT.ok;
  }
  if (tribe.tool === undefined) {
    ctx.io.err(ctx.t('cli.tribe.check.not_pinned', { tribe: tribe.id }));
    return EXIT.failed;
  }
  if (!(await setEnabled(ctx, tribe, true))) return EXIT.failed;
  ctx.io.out(ctx.t('cli.tribe.check.enabled', { tribe: tribe.id }));
  return EXIT.ok;
}

async function runCheck(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const tribe = namedTribe(ctx, input.positionals[0]);
  if (tribe === undefined) return EXIT.failed;
  const found = await handOf(tribe, { kingdom: ctx.kingdom, root: ctx.store.root }, ctx.io);
  if (found.kind !== 'ready') {
    const key = found.kind === 'none' ? 'cli.tribe.check.no_runner' : 'cli.tribe.check.broken';
    ctx.io.err(ctx.t(key, { tribe: tribe.id, adapter: tribe.adapter }));
    if (found.kind === 'broken')
      found.problems.forEach((problem) => {
        ctx.io.err(`    ${problem}`);
      });
    return EXIT.failed;
  }
  const { runner } = found.hand;
  capabilityLines(ctx, tribe, runner.capabilities).forEach(ctx.io.out);
  const auth = authFindings(tribe, runner.capabilities, ctx);
  auth.flatMap(findingLines).forEach(ctx.io.err);
  const passed = (await conforms(ctx, input, tribe, runner)) && auth.length === 0;
  if (passed) return enable(ctx, tribe);
  const key = tribe.enabled ? 'cli.tribe.check.failed_enabled' : 'cli.tribe.check.failed';
  ctx.io.err(ctx.t(key, { tribe: tribe.id }));
  return EXIT.failed;
}

export const TRIBE_CHECK: CommandSpec = {
  name: ['tribe', 'check'],
  summary: 'cli.tribe.check.summary',
  args: [{ name: '<id>', help: 'cli.tribe.arg.tribe' }],
  options: {
    scenarios: { type: 'boolean', help: 'cli.tribe.check.option.scenarios' },
    model: { type: 'string', value: '<model>', help: 'cli.tribe.check.option.model' },
  },
  run: runCheck,
};
