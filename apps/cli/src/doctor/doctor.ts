// `elvaria doctor`: is this machine ready to run the kingdom? Registry, git, each tribe's CLI (found, version
// pinned into kingdom.json, terms acknowledged where ADR 0018 requires) and each territory (implementation-plan
// §3.14, §6). It writes only `tribes[].tool`, through the kingdom file's lock.
import { ok } from '@elvaria/domain';
import type { Tribe } from '@elvaria/domain';

import { textOptions, flagOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { checkGit, checkRegistry, checkTerritories } from './check-kingdom.ts';
import { checkTribe } from './check-tribe.ts';
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
  };
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
    'acknowledge-terms': {
      type: 'string',
      value: '<tribe>',
      multiple: true,
      help: 'cli.doctor.option.acknowledge',
    },
  },
  run: runDoctor,
};
