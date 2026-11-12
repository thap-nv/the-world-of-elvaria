// `elvaria quest show <id>`: one quest, its fields as labelled lines (its party too, P1-21 (c)), why it waits (nobody
// can take it, P1-03; the infirmary, P1-32; a scope held, PS-05), what its last run came to (verdicts, plot put back,
// P1-46), then its description.
import type { Event, Quest, Registry } from '@elvaria/domain';
import type { MessageKey } from '@elvaria/i18n';
import { inKingdom } from '@elvaria/store';

import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { QUEST_STATUS_LABEL } from '../labels.ts';
import { NONE } from '../listing.ts';
import { renderTable } from '../table.ts';
import { infirmaryLines, journalOf, lastInfirmaryOf } from './infirmary.ts';
import { lastRunLines } from './last-run.ts';
import { kindName } from './list.ts';
import { partyFields } from './party.ts';
import { readQuest } from './references.ts';
import { scopeWaitText, scopeWaitsOf } from './scope.ts';
import { unclaimableLines, unclaimableOf } from './unclaimable.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

const listed = (values: readonly string[]): string => (values.length === 0 ? NONE : values.join(', '));

function fields(
  ctx: KingdomContext,
  registry: Registry | undefined,
  quest: Quest,
  quests: readonly Quest[],
): [MessageKey, string][] {
  const { t } = ctx;
  return [
    ['cli.quest.field.status', `${t(QUEST_STATUS_LABEL[quest.status])} (${quest.status})`],
    ['cli.quest.field.kind', `${kindName(ctx, registry, quest.kind)} (${quest.kind})`],
    ['cli.quest.field.rank', quest.rank],
    ...(quest.scope_paths === undefined
      ? []
      : [['cli.quest.field.scope', listed(quest.scope_paths)] satisfies [MessageKey, string]]),
    ['cli.quest.field.tier', quest.tier],
    ['cli.quest.field.territory', quest.territory],
    ['cli.quest.field.class', quest.class_required ?? NONE],
    ['cli.quest.field.tags', listed(quest.tags)],
    ...partyFields(ctx, quest, quests),
    ['cli.quest.field.assignee', quest.assignee ?? NONE],
    ['cli.quest.field.verifier', quest.verifier ?? NONE],
    ['cli.quest.field.attempts', `${quest.attempts}/${quest.budget.max_attempts}`],
    ['cli.quest.field.depends_on', listed(quest.depends_on)],
    ['cli.quest.field.seal', t(quest.seal_required ? 'cli.yes' : 'cli.no')],
    ['cli.quest.field.created', `${quest.created_at} (${quest.created_by})`],
    ['cli.quest.field.updated', quest.updated_at],
    ...(quest.blocked === undefined
      ? []
      : [['cli.quest.field.question', quest.blocked.question] satisfies [MessageKey, string]]),
    ...deliveryFields(ctx, quest),
  ];
}

/** Once delivered (P1-14): when, the branch to merge, and the delivery note as a path the owner can open. */
function deliveryFields(ctx: KingdomContext, quest: Quest): [MessageKey, string][] {
  const { delivered_at: at, branch, path } = quest.deliverable;
  if (at === undefined) return [];
  return [
    ['cli.quest.field.delivered', at],
    ...(branch === undefined ? [] : [['cli.quest.field.branch', branch] satisfies [MessageKey, string]]),
    ...(path === undefined
      ? []
      : [['cli.quest.field.delivery_note', inKingdom(ctx.store.root, path)] satisfies [MessageKey, string]]),
  ];
}

async function runQuestShow(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const quest = await readQuest(ctx, input.positionals[0] ?? '');
  if (Array.isArray(quest)) {
    quest.forEach(ctx.io.err);
    return EXIT.failed;
  }
  const registry = await ctx.store.loadRegistry();
  // Where its party stands is read from every quest (P1-21 (c)); a file that cannot be read counts as none.
  const { items } = await ctx.store.quests.list();
  const rows = fields(ctx, registry.ok ? registry.value : undefined, quest, items).map(([label, value]) => [
    ctx.t(label),
    value,
  ]);
  const note = (await unclaimableOf(ctx, [quest])).get(quest.id);
  const why =
    note === undefined
      ? []
      : ['', ...(await unclaimableLines(ctx, registry.ok ? registry.value : undefined, quest, note))];
  const wait = (await scopeWaitsOf(ctx, items)).get(quest.id);
  const scope = wait === undefined ? [] : ['', scopeWaitText(ctx, wait)];
  const journal = await journalOf(ctx, quest);
  const sick = infirmaryNote(ctx, quest, journal);
  const last = await lastRunLines(ctx, quest, journal);
  [
    `${quest.id}  ${quest.title}`,
    ...renderTable(rows),
    ...why,
    ...scope,
    ...sick,
    ...last,
    '',
    quest.description,
  ].forEach(ctx.io.out);
  return EXIT.ok;
}

/** A quest in the infirmary: why it went there, from its journal (P1-32). */
function infirmaryNote(ctx: KingdomContext, quest: Quest, journal: readonly Event[]): string[] {
  if (quest.status !== 'infirmary') return [];
  const line = lastInfirmaryOf(journal);
  return line === undefined ? [] : ['', ...infirmaryLines(ctx.t, line)];
}

export const QUEST_SHOW: CommandSpec = {
  name: ['quest', 'show'],
  summary: 'cli.quest.show.summary',
  args: [{ name: '<quest>', help: 'cli.quest.arg.quest' }],
  options: {},
  run: runQuestShow,
};
