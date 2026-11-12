// `elvaria quest edit <id>`: the owner's way to change a quest without touching its file (implementation-plan
// §9.2). The command carries the quest's updated_at as read now; the Steward rejects it if the quest changed in
// between, so an edit never overwrites a change the owner has not seen; an edit of the budget alone is taken whatever
// the quest became (P1-54: the Steward moves a running quest many times a minute, and only the owner sets a budget).
import { QUEST_TITLE_MAX_LENGTH, RANKS } from '@elvaria/domain';
import type { Rank } from '@elvaria/domain';

import { flagOption, textOption, textOptions } from '../args.ts';
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { questsMissing, readQuest } from './references.ts';
import { commandHeader, sendCommand } from './send-command.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

const isRank = (value: string): value is Rank => (RANKS as readonly string[]).includes(value);

/** Statuses in which a session of the quest may be running: a character works it, or a judge reads it. */
const SESSION_STATUSES: readonly string[] = ['working', 'review'];

/** A whole number ≥ `min` from `--<name>`; undefined when absent, NaN when not such a number. */
function wholeNumber(input: CommandInput, name: string, min: number): number | undefined {
  const text = textOption(input, name);
  if (text === undefined) return undefined;
  const value = Number(text);
  return /^\d+$/.test(text) && value >= min ? value : Number.NaN;
}

function readBudget(input: CommandInput, ctx: KingdomContext) {
  const minutes = wholeNumber(input, 'max-minutes', 1);
  const tokens = wholeNumber(input, 'max-tokens', 0);
  const attempts = wholeNumber(input, 'max-attempts', 1);
  const given = [
    ['--max-minutes', minutes],
    ['--max-tokens', tokens],
    ['--max-attempts', attempts],
  ] as const;
  const problems = given
    .filter(([, value]) => Number.isNaN(value))
    .map(([option]) => ctx.t('cli.quest.edit.bad_number', { option }));
  const budget = {
    ...(minutes === undefined ? {} : { max_minutes: minutes }),
    ...(tokens === undefined ? {} : { max_tokens: tokens }),
    ...(attempts === undefined ? {} : { max_attempts: attempts }),
  };
  return { budget: Object.keys(budget).length === 0 ? undefined : budget, problems };
}

function readChanges(input: CommandInput, ctx: KingdomContext) {
  const problems: string[] = [];
  const title = textOption(input, 'title');
  if (title?.length === 0 || (title?.length ?? 0) > QUEST_TITLE_MAX_LENGTH)
    problems.push(ctx.t('cli.quest.title_length', { max: QUEST_TITLE_MAX_LENGTH }));
  const rank = textOption(input, 'rank')?.toUpperCase();
  if (rank !== undefined && !isRank(rank))
    problems.push(ctx.t('cli.error.choice', { option: '--rank', choices: RANKS.join(', ') }));
  const dependsOn = textOptions(input, 'depends-on');
  const { budget, problems: budgetProblems } = readBudget(input, ctx);
  const seal = flagOption(input, 'seal');
  const description = textOption(input, 'description');
  const changes = {
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(rank === undefined || !isRank(rank) ? {} : { rank }),
    ...(seal === undefined ? {} : { seal_required: seal }),
    ...(dependsOn.length === 0 ? {} : { depends_on: [...new Set(dependsOn)] }),
    ...(budget === undefined ? {} : { budget }),
  };
  return { changes, dependsOn, problems: [...problems, ...budgetProblems] };
}

async function runQuestEdit(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const quest = await readQuest(ctx, input.positionals[0] ?? '');
  if (Array.isArray(quest)) {
    quest.forEach(ctx.io.err);
    return EXIT.failed;
  }
  const { changes, dependsOn, problems } = readChanges(input, ctx);
  if (Object.keys(changes).length === 0 && problems.length === 0) {
    ctx.io.err(ctx.t('cli.quest.edit.nothing'));
    return EXIT.usage;
  }
  const self = dependsOn.includes(quest.id) ? [ctx.t('cli.quest.edit.self_dependency')] : [];
  const all = [...problems, ...self, ...(await questsMissing(ctx, dependsOn))];
  if (all.length > 0) {
    all.forEach(ctx.io.err);
    return EXIT.failed;
  }
  const payload = { quest: quest.id, expected_updated_at: quest.updated_at, changes };
  const command = { ...commandHeader(ctx), kind: 'edit_quest', payload } as const;
  const code = await sendCommand(ctx, command, 'cli.quest.edit.sent', { id: quest.id });
  const minutes = changes.budget?.max_minutes;
  // The session's CLI was given its clock when the session opened (`--print-timeout`, P1-56, (g) of the P1-50 report).
  if (code === EXIT.ok && minutes !== undefined && SESSION_STATUSES.includes(quest.status))
    ctx.io.out(
      ctx.t('cli.quest.edit.minutes_next_session', { id: quest.id, minutes, was: quest.budget.max_minutes }),
    );
  return code;
}

export const QUEST_EDIT: CommandSpec = {
  name: ['quest', 'edit'],
  summary: 'cli.quest.edit.summary',
  args: [{ name: '<quest>', help: 'cli.quest.arg.quest' }],
  options: {
    title: { type: 'string', value: '<text>', help: 'cli.quest.add.option.title' },
    description: { type: 'string', value: '<text>', help: 'cli.quest.add.option.description' },
    rank: { type: 'string', value: '<F..S>', help: 'cli.quest.add.option.rank' },
    seal: { type: 'boolean', help: 'cli.quest.edit.option.seal' },
    'depends-on': {
      type: 'string',
      value: '<quest>',
      multiple: true,
      help: 'cli.quest.edit.option.depends_on',
    },
    'max-minutes': { type: 'string', value: '<n>', help: 'cli.quest.edit.option.max_minutes' },
    'max-tokens': { type: 'string', value: '<n>', help: 'cli.quest.edit.option.max_tokens' },
    'max-attempts': { type: 'string', value: '<n>', help: 'cli.quest.edit.option.max_attempts' },
  },
  run: runQuestEdit,
};
