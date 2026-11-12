// `elvaria doctor`: is this machine ready to run the kingdom? Registry (and what a newer default has that it lacks,
// P1-41), git, each tribe's CLI (found, version pinned into kingdom.json, terms acknowledged where ADR 0018 requires;
// on Windows, whether PowerShell runs scripts for a tribe whose sessions use it, P1-41), each territory
// (implementation-plan §3.14, §6) and the programs its commands start (P1-41), then what its quests need of the machine:
// Docker running when a command uses it, a git identity, `.claude/rules/` within `patch_paths` (P1-56); the models
// whose work has a single judge (P1-56), the treasury file, the sessions a
// stopped Steward left running (P1-11), the mana gauges the Steward logged, asleep or not (P1-32), and the build the
// kingdom pins (PS-04b). It writes only `tribes[].tool` and, with `--enable`, `tribes[].enabled` (P1-15)
// when this run finds nothing wrong with that tribe (P1-34), through the kingdom file's lock.
import { ok } from '@elvaria/domain';
import type { Tribe } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import { textOptions, flagOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { isAdapterFile } from '../tribe/adapter-file.ts';
import { checkBuild } from '../upgrade/running.ts';
import { checkTerritoryCommands } from './check-commands.ts';
import { checkJudges } from './check-judges.ts';
import { checkGit, checkRegistry, checkTerritories } from './check-kingdom.ts';
import { checkMana } from './check-mana.ts';
import { checkLeftSessions, checkTreasury } from './check-state.ts';
import { checkTerritorySetup } from './check-territory-setup.ts';
import { checkTribe, skipsTribe } from './check-tribe.ts';
import { finding, findingLines } from './finding.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { DoctorOptions } from './check-tribe.ts';
import type { Finding } from './finding.ts';

/** `--tool claude=C:/…/claude.exe` pairs; undefined when one has no `=`. */
export function toolPaths(values: readonly string[]): Map<string, string> | undefined {
  const pairs = values.map((value) => {
    const at = value.indexOf('=');
    return at <= 0 ? undefined : ([value.slice(0, at), value.slice(at + 1)] as const);
  });
  if (pairs.some((pair) => pair === undefined)) return undefined;
  return new Map(pairs.filter((pair) => pair !== undefined));
}

/**
 * Why the tribe options cannot be honoured, before anything is checked or written (P1-15): a tribe kingdom.json
 * does not have, or terms to acknowledge for a tribe doctor skips because it is disabled. Before P1-15 both were
 * ignored without a word, and the owner believed the terms were recorded. `--enable` of a tribe whose adapter is an
 * owner file is refused too (P1-34): a built-in adapter passed the conformance suite in this repo's CI, an owner
 * file has passed nothing until `elvaria tribe check` runs the suite against it.
 */
export function optionProblems(tribes: readonly Tribe[], options: DoctorOptions, t: Translate): string[] {
  const known = new Map(tribes.map((tribe) => [tribe.id as string, tribe]));
  const list = [...known.keys()].join(', ');
  const named = [
    ...[...options.tools.keys()].map((tribe) => ({ option: '--tool', tribe })),
    ...[...options.enable].map((tribe) => ({ option: '--enable', tribe })),
    ...[...options.acknowledge].map((tribe) => ({ option: '--acknowledge-terms', tribe })),
  ];
  const unknown = named
    .filter(({ tribe }) => !known.has(tribe))
    .map(({ option, tribe }) => t('cli.doctor.unknown_tribe', { option, tribe, tribes: list }));
  const skipped = [...options.acknowledge].flatMap((id) => {
    const tribe = known.get(id);
    return tribe !== undefined && skipsTribe(tribe, options)
      ? [t('cli.doctor.acknowledge_disabled', { tribe: id })]
      : [];
  });
  const files = [...options.enable].flatMap((id) => {
    const tribe = known.get(id);
    return tribe !== undefined && isAdapterFile(tribe.adapter)
      ? [t('cli.doctor.enable_adapter_file', { tribe: id, adapter: tribe.adapter })]
      : [];
  });
  return [...unknown, ...skipped, ...files];
}

/** Writes the re-pinned tribes into kingdom.json under its lock, leaving everything else as it is on disk. */
async function saveTribes(ctx: KingdomContext, updated: readonly Tribe[]): Promise<Finding | undefined> {
  if (updated.length === 0) return undefined;
  const byId = new Map(updated.map((tribe) => [tribe.id, tribe]));
  const saved = await ctx.store.kingdom.update((current) =>
    ok({ ...current, tribes: current.tribes.map((tribe) => byId.get(tribe.id) ?? tribe) }),
  );
  if (saved.ok) return finding('ok', ctx.t('cli.doctor.saved', { tribes: [...byId.keys()].join(', ') }));
  const [head = '', ...details] = storeIssueLines(ctx.t, saved.error);
  return finding('error', head, details);
}

async function runDoctor(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const tools = toolPaths(textOptions(input, 'tool'));
  if (tools === undefined) {
    cli.io.err(cli.t('cli.doctor.bad_tool_option'));
    return EXIT.usage;
  }
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const options: DoctorOptions = {
    tools,
    pin: flagOption(input, 'pin') ?? false,
    acknowledge: new Set(textOptions(input, 'acknowledge-terms')),
    enable: new Set(textOptions(input, 'enable')),
  };
  const problems = optionProblems(ctx.kingdom.tribes, options, ctx.t);
  if (problems.length > 0) {
    problems.forEach(ctx.io.err);
    return EXIT.usage;
  }
  const tribes = await Promise.all(ctx.kingdom.tribes.map((tribe) => checkTribe(tribe, ctx, options)));
  const saved = await saveTribes(
    ctx,
    tribes.flatMap((check) => (check.updated === undefined ? [] : [check.updated])),
  );
  const findings = [
    ...(await checkRegistry(ctx)),
    await checkGit(ctx),
    ...tribes.flatMap((check) => check.findings),
    ...(saved === undefined ? [] : [saved]),
    ...(await checkTerritories(ctx)),
    ...(await checkTerritoryCommands(ctx)),
    ...(await checkTerritorySetup(ctx)),
    ...(await checkJudges(ctx)),
    await checkTreasury(ctx),
    ...(await checkLeftSessions(ctx)),
    ...(await checkMana(ctx)),
    await checkBuild(ctx.t, ctx.store.root, ctx.io.platform),
  ];
  findings.flatMap(findingLines).forEach(ctx.io.out);
  const errors = findings.filter((item) => item.level === 'error').length;
  ctx.io.out(errors === 0 ? ctx.t('cli.doctor.ready') : ctx.t('cli.doctor.not_ready', { count: errors }));
  return errors === 0 ? EXIT.ok : EXIT.failed;
}

export const DOCTOR: CommandSpec = {
  name: ['doctor'],
  summary: 'cli.doctor.summary',
  args: [],
  options: {
    tool: { type: 'string', value: '<tribe>=<path>', multiple: true, help: 'cli.doctor.option.tool' },
    pin: { type: 'boolean', help: 'cli.doctor.option.pin' },
    enable: { type: 'string', value: '<tribe>', multiple: true, help: 'cli.doctor.option.enable' },
    'acknowledge-terms': {
      type: 'string',
      value: '<tribe>',
      multiple: true,
      help: 'cli.doctor.option.acknowledge',
    },
  },
  run: runDoctor,
};
