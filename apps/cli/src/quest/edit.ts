// `elvaria quest edit <id>`: the owner's way to change a quest without touching its file (implementation-plan
// §9.2). The command carries the quest's updated_at as read now; the Steward rejects it if the quest changed in
// between, so an edit never overwrites a change the owner has not seen; an edit of the budget alone is taken whatever
// the quest became (P1-54: the Steward moves a running quest many times a minute, and only the owner sets a budget).
import { MS_PER_MINUTE, QUEST_TITLE_MAX_LENGTH, RANKS, parseInstant } from '@elvaria/domain';
import type { Quest, Rank } from '@elvaria/domain';

import { flagOption, textOption, textOptions } from '../args.ts';
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { questsMissing, readQuest } from './references.ts';
import { readScope } from './scope.ts';
import { commandHeader, sendCommand } from './send-command.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

const isRank = (value: string): value is Rank => (RANKS as readonly string[]).includes(value);

/** The role whose session may be running in a status: a character works the quest, or a judge reads it. */
const SESSION_ROLE: Partial<Record<Quest['status'], 'assignee' | 'verifier'>> = {
  working: 'assignee',
  review: 'verifier',
};

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
  const scope = readScope(input);
  const changes = {
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(rank === undefined || !isRank(rank) ? {} : { rank }),
    ...(seal === undefined ? {} : { seal_required: seal }),
    ...(dependsOn.length === 0 ? {} : { depends_on: [...new Set(dependsOn)] }),
    ...(scope.length === 0 ? {} : { scope_paths: scope }),
    ...(budget === undefined ? {} : { budget }),
  };
  return { changes, dependsOn, problems: [...problems, ...budgetProblems] };
}

/**
 * What a new minute ceiling does to the session running now. The Steward applies the edit, then its time breaker reads
 * the quest's ceiling on every tick, against the session's own attempt_log entry (breakersOf in planTick): lower, it
 * cuts a session already past it at that tick; higher, the session has the time from then on. Only a CLI that took its
 * own clock when the session opened (agy's `--print-timeout`) still stops it at the old ceiling. P1-56 said the ceiling
 * reached the next session only, which held for agy alone (lessons of 2026-11-12, A2).
 */
function minuteLines(ctx: KingdomContext, quest: Quest, minutes: number): string[] {
  const role = SESSION_ROLE[quest.status];
  const was = quest.budget.max_minutes;
  if (role === undefined || minutes === was) return [];
  const entry = quest.attempt_log.findLast((run) => run.role === role && run.ended_at === undefined);
  const started = entry === undefined ? undefined : parseInstant(entry.started_at);
  // In review before a judge opens its session, or a quest file without one: nothing runs to tell about.
  if (started?.ok !== true) return [];
  const elapsed = ctx.io.clock.now() - started.value;
  const params = { id: quest.id, minutes, was, ran: Math.floor(elapsed / MS_PER_MINUTE) };
  if (minutes > was) return [ctx.t('cli.quest.edit.minutes_raised', params)];
  if (elapsed < minutes * MS_PER_MINUTE) return [ctx.t('cli.quest.edit.minutes_lowered', params)];
  const cut = role === 'assignee' ? 'cli.quest.edit.minutes_cut' : 'cli.quest.edit.minutes_cut_judge';
  return [ctx.t(cut, params)];
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
  if (code === EXIT.ok && minutes !== undefined) minuteLines(ctx, quest, minutes).forEach(ctx.io.out);
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
    scope: { type: 'string', value: '<glob>', multiple: true, help: 'cli.quest.edit.option.scope' },
  },
  run: runQuestEdit,
};
