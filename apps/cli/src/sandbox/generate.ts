// `elvaria sandbox generate --day busy|quiet|mana-out --seed 42 [--date YYYY-MM-DD]`: one fake day of the kingdom,
// played by the domain's own state machines and written to events/sandbox/<date>.jsonl (implementation-plan §7).
// Nothing else of the kingdom changes: no quest, no character, no inbox command, no real event.
import type { Registry } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';
import { DAYS, isDayId, simulateDay, writeDay } from '@elvaria/sandbox';
import type { DayProblem, DayRequest, RegistryWhat } from '@elvaria/sandbox';

import { textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { registryIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** A seed is a 32-bit state (mulberry32 in @elvaria/sandbox). */
const SEED_MAX = 2 ** 32 - 1;
const SEED_BYTES = 4;
const BYTE_BITS = 8;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_LENGTH = 10;

const WHAT_LABEL = {
  class: 'cli.sandbox.what.class',
  kind: 'cli.sandbox.what.kind',
  script: 'cli.sandbox.what.script',
  tag: 'cli.sandbox.what.tag',
} as const satisfies Record<RegistryWhat, string>;

export function problemText(t: Translate, problem: DayProblem): string {
  switch (problem.code) {
    case 'missing_tribe':
      return t('cli.sandbox.problem.missing_tribe', { tribe: problem.id });
    case 'missing_entry':
      return t('cli.sandbox.problem.missing_entry', { what: t(WHAT_LABEL[problem.what]), id: problem.id });
    case 'not_allowed':
      return t('cli.sandbox.problem.not_allowed', { kind: problem.kind, id: problem.id });
    case 'invalid_date':
      return t('cli.sandbox.bad_date');
    case 'invalid_time_zone':
      return t('cli.error.time_zone', { tz: problem.tz });
  }
}

/** A random seed when none is given: printed with the day, so the same day can be made again. */
const randomSeed = (ctx: KingdomContext): number =>
  ctx.io.random.bytes(SEED_BYTES).reduce((seed, byte) => seed * 2 ** BYTE_BITS + byte, 0);

/** Today in the kingdom's zone (ctx.now() writes the kingdom's local time), as the files of the day are named. */
const today = (ctx: KingdomContext): string => ctx.now().slice(0, DATE_LENGTH);

/** What the owner asked for, or every problem with the command line at once. */
function readRequest(input: CommandInput, ctx: KingdomContext): DayRequest | string[] {
  const { t } = ctx;
  const problems: string[] = [];
  const day = textOption(input, 'day') ?? 'busy';
  if (!isDayId(day)) problems.push(t('cli.error.choice', { option: '--day', choices: DAYS.join(', ') }));
  const seedText = textOption(input, 'seed');
  const seed = seedText === undefined ? randomSeed(ctx) : Number(seedText);
  if (seedText !== undefined && (!/^\d+$/.test(seedText) || seed > SEED_MAX)) {
    problems.push(t('cli.sandbox.bad_seed', { max: SEED_MAX }));
  }
  const date = textOption(input, 'date') ?? today(ctx);
  if (!DATE.test(date)) problems.push(t('cli.sandbox.bad_date'));
  return problems.length > 0 || !isDayId(day) ? problems : { day, seed, date };
}

async function generate(ctx: KingdomContext, request: DayRequest, registry: Registry): Promise<ExitCode> {
  const { t, io } = ctx;
  const played = simulateDay({ ...request, kingdom: ctx.kingdom, registry });
  if (!played.ok) {
    played.error.map((problem) => problemText(t, problem)).forEach(io.err);
    return EXIT.failed;
  }
  const day = played.value;
  const file = await writeDay(ctx.store.root, day);
  const { quests, characters } = day.evening;
  const counts = { lines: day.events.length, quests: quests.length, characters: characters.length };
  io.out(t('cli.sandbox.generated', { ...request, ...counts }));
  io.out(t('cli.sandbox.written', { file }));
  io.out(t('cli.sandbox.replay_hint', { file }));
  return EXIT.ok;
}

async function runGenerate(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const request = readRequest(input, ctx);
  if (Array.isArray(request)) {
    request.forEach(ctx.io.err);
    return EXIT.usage;
  }
  const registry = await ctx.store.loadRegistry();
  if (!registry.ok) {
    registry.error.flatMap((issue) => registryIssueLines(ctx.t, issue)).forEach(ctx.io.err);
    return EXIT.failed;
  }
  return generate(ctx, request, registry.value);
}

export const SANDBOX_GENERATE: CommandSpec = {
  name: ['sandbox', 'generate'],
  summary: 'cli.sandbox.generate.summary',
  args: [],
  options: {
    day: { type: 'string', value: '<busy|quiet|mana-out>', help: 'cli.sandbox.generate.option.day' },
    seed: { type: 'string', value: '<n>', help: 'cli.sandbox.generate.option.seed' },
    date: { type: 'string', value: '<YYYY-MM-DD>', help: 'cli.sandbox.generate.option.date' },
  },
  run: runGenerate,
};
