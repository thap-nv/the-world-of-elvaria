// `elvaria tribe check <id> [--scenarios] [--model <slug>] [--tool <path>] [--timeout <seconds>]` (implementation-plan
// §3.14, ADR 0021): the conformance suite of runner-core against the tribe's runner, built from its adapter as
// `elvaria run` builds it (what it declares is printed first, ./check-declared.ts), plus the sign-in kingdom.json
// pins against the ones the adapter declares (checkTribeAuth, P1-19) and, once the suite passes, the login its adapter
// reports, as doctor does (P1-34). A tribe that passes is enabled; one that fails stays as it is. With the real CLI only
// the checks that burn no or almost no mana run (a tiny job, a forbidden push, a kill, the probe), on the CLI doctor
// would find; a pass pins that CLI for this tribe alone, and a failed check's workspace is kept (./check-live.ts,
// lessons of 2026-11-13). `--scenarios` runs every check against a fake CLI that plays the suite's scenarios from
// ELVARIA_FAKE_SCENARIO, as the specs' do, and pins nothing; with `--tool <path>` it writes nothing at all: `elvaria
// upgrade` runs the suite of a new build against the fake CLIs it carries (PS-04b).
import path from 'node:path';

import { checkModelOf } from '@elvaria/domain';
import type { Tribe } from '@elvaria/domain';
import { runConformance } from '@elvaria/runner-core';
import type { AgentRunner, ConformanceReport } from '@elvaria/runner-core';
import { fromPortable, toPortable } from '@elvaria/store';

import { flagOption, textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { authFindings, loginFindings } from '../doctor/check-tribe.ts';
import { findingLines } from '../doctor/finding.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { minimalEnv } from '../process/minimal-env.ts';
import { handOf } from '../run/crew.ts';
import { capabilityLines } from './check-declared.ts';
import { keepFailed, liveToolOf, pinChecked } from './check-live.ts';
import { namedTribe, setEnabled } from './save.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { CliIo } from '../io.ts';
import type { LiveTool } from './check-live.ts';

/** How long one session of a fake CLI may take to answer: it answers at once, a hang is killed long before. */
const FAKE_TIMEOUT_MS = 120_000;
/**
 * The real CLI's ceiling, the probe's own budget (5 minutes): agy 1.5.7 on gemini-3.8-flash-high took more than 120 s
 * for `submit` (2026-11-13). `--timeout` sets another.
 */
const LIVE_TIMEOUT_MS = 300_000;
const MS_PER_SECOND = 1000;

function reportLine(ctx: KingdomContext, report: ConformanceReport): string {
  if (report.outcome === 'passed') return ctx.t('cli.tribe.check.passed_check', { check: report.id });
  if (report.outcome === 'skipped') return ctx.t('cli.tribe.check.skipped_check', { check: report.id });
  return ctx.t('cli.tribe.check.failed_check', { check: report.id, problem: report.problem ?? '' });
}

/**
 * The model the suite runs on (PS-23, settled 2026-11-13): `--model`; else the tribe's own (checkModelOf: its
 * default model, else the cheapest model its characters run on a pool that is on). A fake CLI (`--scenarios`) takes
 * any, so there the suite's own stands in. A real one with none is refused: `missing`, said with how to name one.
 */
async function modelToTry(
  ctx: KingdomContext,
  input: CommandInput,
  tribe: Tribe,
  runner: AgentRunner,
): Promise<{ readonly model?: string; readonly missing?: true }> {
  const given = textOption(input, 'model');
  if (given !== undefined) return { model: given };
  const live = flagOption(input, 'scenarios') !== true;
  const characters = (await ctx.store.characters.list()).items;
  const chosen = checkModelOf(tribe, ctx.kingdom.tribes, characters, runner.capabilities.models);
  if (chosen === undefined) return live ? { missing: true } : {};
  if (live) {
    const key =
      chosen.from === 'character' ? 'cli.tribe.check.model_character' : 'cli.tribe.check.model_default';
    ctx.io.out(ctx.t(key, { tribe: tribe.id, ...chosen }));
  }
  return { model: chosen.model };
}

/** One session's ceiling: `--timeout <seconds>`, else the default of a real or a fake CLI; undefined when invalid. */
function timeoutOf(input: CommandInput, live: boolean): number | undefined {
  const text = textOption(input, 'timeout');
  if (text === undefined) return live ? LIVE_TIMEOUT_MS : FAKE_TIMEOUT_MS;
  const seconds = Number(text);
  return Number.isInteger(seconds) && seconds > 0 ? seconds * MS_PER_SECOND : undefined;
}

/** What this run checks: the tribe as the runner sees it, the CLI the owner or doctor's search names, the real CLI. */
interface Tried {
  readonly tribe: Tribe;
  /** A CLI in place of the pinned one: `--tool`, or where a moved CLI is now. */
  readonly toolPath?: string;
  /** The real CLI found, when a pass pins it: a tribe doctor has pinned, without `--scenarios`. */
  readonly live?: LiveTool;
}

/** The tribe as `toolPath` asks to try it: another CLI in place of the pinned one, for this run. */
function triedTribe(tribe: Tribe, toolPath: string | undefined, io: CliIo): Tribe {
  if (toolPath === undefined) return tribe;
  const tool = {
    auth: 'login' as const,
    version: 'unpinned',
    ...tribe.tool,
    path: toPortable(toolPath, io.platform),
  };
  return { ...tribe, tool };
}

/** What to check, or undefined once doctor's reason why the real CLI cannot be found is printed. */
async function triedOf(ctx: KingdomContext, named: Tribe, given: string | undefined, live: boolean) {
  const as = (toolPath: string | undefined, found?: LiveTool): Tried => ({
    tribe: triedTribe(named, toolPath, ctx.io),
    ...(toolPath === undefined ? {} : { toolPath }),
    ...(found === undefined ? {} : { live: found }),
  });
  // A tribe doctor never pinned waits for doctor (its sign-in, its terms); a fake CLI is never pinned.
  if (!live || named.tool === undefined) return as(given);
  const found = await liveToolOf(ctx, named, given);
  if (found === undefined) return undefined;
  const moved = found.path === named.tool.path ? undefined : fromPortable(found.path, ctx.io.platform);
  return as(given ?? moved, found);
}

/** The suite against `runner` on `model` (the suite's own when undefined): true when no check failed. */
async function conforms(ctx: KingdomContext, tried: Tried, runner: AgentRunner, run: SuiteRun) {
  const reports = await runConformance({
    name: tried.tribe.id,
    createRunner: () => runner,
    live: run.live,
    env: minimalEnv(ctx.io.env),
    timeout_ms: run.timeout_ms,
    ...(run.model === undefined ? {} : { model: run.model }),
    // A temp folder a CLI's process still holds (agy on Windows, 2026-11-12) is said, not counted as a failure.
    onLeftover: ({ scenario, dir, problem }) => {
      ctx.io.err(ctx.t('cli.tribe.check.left_workspace', { check: scenario, dir, problem }));
    },
    ...(run.live ? { onFailed: keepFailed(ctx, tried.tribe) } : {}),
  });
  reports.forEach((report) => {
    ctx.io.out(reportLine(ctx, report));
  });
  return reports.every(({ outcome }) => outcome !== 'failed');
}

interface SuiteRun {
  readonly live: boolean;
  readonly timeout_ms: number;
  readonly model?: string;
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

/** A pass: the real CLI pinned for this tribe, or nothing written for another CLI on a fake run, or the tribe enabled. */
async function passed(ctx: KingdomContext, named: Tribe, tried: Tried): Promise<ExitCode> {
  if (tried.live !== undefined && named.tool !== undefined) {
    if (!(await pinChecked(ctx, { ...named, tool: named.tool }, tried.live))) return EXIT.failed;
    ctx.io.out(
      ctx.t(named.enabled ? 'cli.tribe.check.passed' : 'cli.tribe.check.enabled', { tribe: named.id }),
    );
    return EXIT.ok;
  }
  if (tried.toolPath === undefined) return enable(ctx, named);
  ctx.io.out(ctx.t('cli.tribe.check.passed_tool', { tribe: named.id, tool: tried.toolPath }));
  return EXIT.ok;
}

/**
 * The suite and the sign-in of `tried`, on the runner built for it: whether it passes, or `refused` when it could not
 * run at all (no runner, a broken adapter file, no model), which says its own reason and no verdict.
 */
async function passes(
  ctx: KingdomContext,
  input: CommandInput,
  tried: Tried,
  run: SuiteRun,
): Promise<boolean | 'refused'> {
  const { tribe } = tried;
  const found = await handOf(tribe, { kingdom: ctx.kingdom, root: ctx.store.root }, ctx.io, tried.toolPath);
  if (found.kind !== 'ready') {
    const key = found.kind === 'none' ? 'cli.tribe.check.no_runner' : 'cli.tribe.check.broken';
    ctx.io.err(ctx.t(key, { tribe: tribe.id, adapter: tribe.adapter }));
    if (found.kind === 'broken')
      found.problems.forEach((problem) => {
        ctx.io.err(`    ${problem}`);
      });
    return 'refused';
  }
  const { runner } = found.hand;
  capabilityLines(ctx.t, tribe, runner.capabilities).forEach(ctx.io.out);
  const model = await modelToTry(ctx, input, tribe, runner);
  if (model.missing === true) {
    ctx.io.err(ctx.t('cli.tribe.check.no_model', { tribe: tribe.id }));
    return 'refused';
  }
  const auth = authFindings(tribe, runner.capabilities, ctx);
  auth.flatMap(findingLines).forEach(ctx.io.err);
  const suite = { ...run, ...(model.model === undefined ? {} : { model: model.model }) };
  const conformed = (await conforms(ctx, tried, runner, suite)) && auth.length === 0;
  // The suite asks only that doctor() answers; a CLI that cannot sign in keeps the tribe off, as in doctor (P1-34).
  const login = conformed ? await loginFindings(tribe, runner, ctx) : [];
  login.flatMap(findingLines).forEach(ctx.io.err);
  return conformed && login.every(({ level }) => level !== 'error');
}

async function runCheck(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const live = flagOption(input, 'scenarios') !== true;
  const timeout = timeoutOf(input, live);
  if (timeout === undefined) {
    cli.io.err(cli.t('cli.tribe.check.bad_timeout', { timeout: textOption(input, 'timeout') ?? '' }));
    return EXIT.usage;
  }
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const named = namedTribe(ctx, input.positionals[0]);
  if (named === undefined) return EXIT.failed;
  const option = textOption(input, 'tool');
  const given = option === undefined ? undefined : path.resolve(ctx.io.cwd, option);
  const tried = await triedOf(ctx, named, given, live);
  const verdict =
    tried === undefined ? 'refused' : await passes(ctx, input, tried, { live, timeout_ms: timeout });
  if (verdict === 'refused') return EXIT.failed;
  if (verdict && tried !== undefined) return passed(ctx, named, tried);
  const key = named.enabled ? 'cli.tribe.check.failed_enabled' : 'cli.tribe.check.failed';
  ctx.io.err(ctx.t(key, { tribe: named.id }));
  return EXIT.failed;
}

export const TRIBE_CHECK: CommandSpec = {
  name: ['tribe', 'check'],
  summary: 'cli.tribe.check.summary',
  args: [{ name: '<id>', help: 'cli.tribe.arg.tribe' }],
  options: {
    scenarios: { type: 'boolean', help: 'cli.tribe.check.option.scenarios' },
    model: { type: 'string', value: '<model>', help: 'cli.tribe.check.option.model' },
    tool: { type: 'string', value: '<path>', help: 'cli.tribe.check.option.tool' },
    timeout: { type: 'string', value: '<seconds>', help: 'cli.tribe.check.option.timeout' },
  },
  run: runCheck,
};
