// `elvaria territory checks <id> [--mode full|narrow|deferred]` (CM-01, ADR 0032): prints how much of its checks a
// territory's quests run (check_policy, and each check's `run` and `narrow`), or changes the mode. The CLI writes
// territory.json itself, as `territory delivery` does (ADR 0005, .claude/rules/cli.md): the Steward reads a territory
// again at each tick, so the change counts from its next one. full_when and the narrow commands are edited in the
// file. No event: check_policy is not in the territory view the world draws. 0 mana.
import {
  CHECK_MODES,
  TerritoryIdSchema,
  checkPolicyOf,
  commandLinesOf,
  defersWhereItCan,
  ok,
} from '@elvaria/domain';
import type { CheckMode, Territory, TerritoryCheck } from '@elvaria/domain';

import { textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

const isMode = (value: string): value is CheckMode => (CHECK_MODES as readonly string[]).includes(value);

const commandsOf = (lines: TerritoryCheck['run']): string => commandLinesOf(lines).join(' && ');

function checkLine(ctx: KingdomContext, check: TerritoryCheck): string {
  const run = commandsOf(check.run);
  if (check.narrow === undefined) return ctx.t('cli.territory.checks.check', { id: check.id, run });
  return ctx.t('cli.territory.checks.check_narrow', { id: check.id, run, narrow: commandsOf(check.narrow) });
}

function printPolicy(ctx: KingdomContext, territory: Territory): void {
  const { t, io } = ctx;
  const policy = checkPolicyOf(territory);
  io.out(t('cli.territory.checks.mode', { id: territory.id, mode: policy.mode }));
  if (territory.check_policy === undefined) io.out(t('cli.territory.checks.unset'));
  const globs = policy.full_when.join(', ');
  io.out(
    t('cli.territory.checks.full_when', { globs: globs === '' ? t('cli.territory.checks.none') : globs }),
  );
  if (policy.mode === 'deferred') {
    const { max_quests: quests, max_wait_minutes: minutes } = policy.train;
    io.out(t('cli.territory.checks.train', { quests, minutes }));
  }
  for (const check of territory.checks) io.out(checkLine(ctx, check));
  if (policy.mode !== 'full' && !territory.checks.some(({ narrow }) => narrow !== undefined))
    io.out(t('cli.territory.checks.no_narrow'));
}

/** Writes the new mode under the store's lock, keeping full_when, the train and whatever else changed on disk. */
async function save(
  ctx: KingdomContext,
  territory: Territory,
  mode: CheckMode,
): Promise<Territory | undefined> {
  const check_policy = { ...checkPolicyOf(territory), mode };
  if (!defersWhereItCan({ ...territory, check_policy })) {
    ctx.io.err(ctx.t('cli.territory.checks.no_train', { id: territory.id }));
    return undefined;
  }
  const written = await ctx.store.territories.update(territory.id, (current) =>
    ok({ ...current, check_policy: { ...checkPolicyOf(current), mode } }),
  );
  if (written.ok) return written.value;
  storeIssueLines(ctx.t, written.error).forEach(ctx.io.err);
  return undefined;
}

async function runTerritoryChecks(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const { t, io } = ctx;
  const id = TerritoryIdSchema.safeParse(input.positionals[0] ?? '');
  const found = id.success ? await ctx.store.territories.read(id.data) : undefined;
  if (!found?.ok) {
    io.err(t('cli.territory.checks.unknown', { id: input.positionals[0] ?? '' }));
    return EXIT.failed;
  }
  const mode = textOption(input, 'mode');
  if (mode === undefined) {
    printPolicy(ctx, found.value);
    return EXIT.ok;
  }
  if (!isMode(mode)) {
    io.err(t('cli.error.choice', { option: '--mode', choices: CHECK_MODES.join(', ') }));
    return EXIT.usage;
  }
  const saved = await save(ctx, found.value, mode);
  if (saved === undefined) return EXIT.failed;
  printPolicy(ctx, saved);
  io.out(t('cli.territory.checks.saved'));
  return EXIT.ok;
}

export const TERRITORY_CHECKS: CommandSpec = {
  name: ['territory', 'checks'],
  summary: 'cli.territory.checks.summary',
  args: [{ name: '<id>', help: 'cli.territory.checks.arg.id' }],
  options: { mode: { type: 'string', value: '<mode>', help: 'cli.territory.checks.option.mode' } },
  run: runTerritoryChecks,
};
