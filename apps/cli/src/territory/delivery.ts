// `elvaria territory delivery <id> [--mode …] [--merge-method …] [--required-check <name>]… [--timeout <minutes>]`
// (PS-08, ADR 0023): prints how a territory delivers, or changes it. The CLI writes territory.json itself, as
// `territory add` does (ADR 0005, .claude/rules/cli.md): a territory is settings the Steward reads again at each tick,
// so the change counts from its next one. No event: `delivery` is not in the territory view the world draws. Nothing
// is pushed here, and no credential is read: `elvaria doctor` checks that.
import { DELIVERY_MODES, MERGE_METHODS, TerritoryIdSchema, deliveryOf, ok } from '@elvaria/domain';
import type { Territory, TerritoryDelivery } from '@elvaria/domain';

import { textOption, textOptions } from '../args.ts';
import { EXIT } from '../command.ts';
import { forgeRepoOf } from '../forge/remote.ts';
import { storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

type Change = Partial<TerritoryDelivery>;

const isOneOf = <T extends string>(values: readonly T[], value: string): value is T =>
  (values as readonly string[]).includes(value);

/** The changes typed on the command line, or the problems with them. */
function readChange(input: CommandInput, ctx: KingdomContext): { change: Change; problems: string[] } {
  const { t } = ctx;
  const problems: string[] = [];
  const change: { -readonly [K in keyof Change]: Change[K] } = {};
  const mode = textOption(input, 'mode');
  if (mode !== undefined && isOneOf(DELIVERY_MODES, mode)) change.mode = mode;
  else if (mode !== undefined)
    problems.push(t('cli.error.choice', { option: '--mode', choices: DELIVERY_MODES.join(', ') }));
  const method = textOption(input, 'merge-method');
  if (method !== undefined && isOneOf(MERGE_METHODS, method)) change.merge_method = method;
  else if (method !== undefined)
    problems.push(t('cli.error.choice', { option: '--merge-method', choices: MERGE_METHODS.join(', ') }));
  const checks = textOptions(input, 'required-check');
  if (checks.length > 0) change.required_checks = [...new Set(checks)];
  const timeout = textOption(input, 'timeout');
  if (timeout !== undefined && /^\d+$/.test(timeout) && Number(timeout) >= 1)
    change.checks_timeout_minutes = Number(timeout);
  else if (timeout !== undefined) problems.push(t('cli.territory.delivery.bad_timeout', { value: timeout }));
  return { change, problems };
}

/** Why `delivery` cannot stand on `territory`: a pushing mode needs a remote that names a repo on its forge. */
function refusalOf(
  ctx: KingdomContext,
  territory: Territory,
  delivery: TerritoryDelivery,
): string | undefined {
  if (delivery.mode === 'manual') return undefined;
  const { remote } = territory.vcs;
  if (territory.vcs.type !== 'git' || remote === undefined)
    return ctx.t('cli.territory.delivery.no_remote', { id: territory.id, mode: delivery.mode });
  if (forgeRepoOf(remote, delivery.forge) !== undefined) return undefined;
  return ctx.t('cli.territory.delivery.not_forge', { id: territory.id, remote, forge: delivery.forge });
}

function printDelivery(ctx: KingdomContext, territory: Territory): void {
  const { t, io } = ctx;
  const delivery = deliveryOf(territory);
  const repo =
    territory.vcs.remote === undefined ? undefined : forgeRepoOf(territory.vcs.remote, delivery.forge);
  io.out(t('cli.territory.delivery.mode', { id: territory.id, mode: delivery.mode }));
  if (territory.delivery === undefined) io.out(t('cli.territory.delivery.unset'));
  const where = repo === undefined ? t('cli.territory.delivery.no_repo') : `${repo.owner}/${repo.name}`;
  io.out(t('cli.territory.delivery.forge', { forge: delivery.forge, repo: where }));
  io.out(t('cli.territory.delivery.merge_method', { method: delivery.merge_method }));
  const checks = delivery.required_checks.join(', ');
  io.out(
    t('cli.territory.delivery.checks', {
      checks: checks === '' ? t('cli.territory.delivery.no_checks') : checks,
    }),
  );
  io.out(t('cli.territory.delivery.timeout', { minutes: delivery.checks_timeout_minutes }));
}

/** Writes the new delivery under the store's lock, keeping whatever else changed on disk meanwhile. */
async function save(
  ctx: KingdomContext,
  territory: Territory,
  change: Change,
): Promise<Territory | undefined> {
  const delivery = { ...deliveryOf(territory), ...change };
  const refusal = refusalOf(ctx, territory, delivery);
  if (refusal !== undefined) {
    ctx.io.err(refusal);
    return undefined;
  }
  const written = await ctx.store.territories.update(territory.id, (current) => ok({ ...current, delivery }));
  if (written.ok) return written.value;
  storeIssueLines(ctx.t, written.error).forEach(ctx.io.err);
  return undefined;
}

async function runTerritoryDelivery(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const { t, io } = ctx;
  const id = TerritoryIdSchema.safeParse(input.positionals[0] ?? '');
  const found = id.success ? await ctx.store.territories.read(id.data) : undefined;
  if (!found?.ok) {
    io.err(t('cli.territory.delivery.unknown', { id: input.positionals[0] ?? '' }));
    return EXIT.failed;
  }
  const { change, problems } = readChange(input, ctx);
  if (problems.length > 0) {
    problems.forEach(io.err);
    return EXIT.usage;
  }
  if (Object.keys(change).length === 0) {
    printDelivery(ctx, found.value);
    return EXIT.ok;
  }
  const saved = await save(ctx, found.value, change);
  if (saved === undefined) return EXIT.failed;
  printDelivery(ctx, saved);
  io.out(t('cli.territory.delivery.saved'));
  if (deliveryOf(saved).mode !== 'manual') io.out(t('cli.territory.delivery.doctor_hint'));
  return EXIT.ok;
}

export const TERRITORY_DELIVERY: CommandSpec = {
  name: ['territory', 'delivery'],
  summary: 'cli.territory.delivery.summary',
  args: [{ name: '<id>', help: 'cli.territory.delivery.arg.id' }],
  options: {
    mode: { type: 'string', value: '<mode>', help: 'cli.territory.delivery.option.mode' },
    'merge-method': { type: 'string', value: '<method>', help: 'cli.territory.delivery.option.merge_method' },
    'required-check': {
      type: 'string',
      value: '<name>',
      multiple: true,
      help: 'cli.territory.delivery.option.required_check',
    },
    timeout: { type: 'string', value: '<minutes>', help: 'cli.territory.delivery.option.timeout' },
  },
  run: runTerritoryDelivery,
};
