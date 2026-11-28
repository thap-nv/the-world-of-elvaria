// `elvaria quest show <id>`: one quest, its fields as labelled lines (its party too, P1-21 (c); the owner's hold,
// fix/quest-hold), why it waits (nobody can take it, P1-03; the infirmary, P1-32; a scope held, PS-05; a heal, ADR
// 0034), the protected paths its work changed (PS-04), what its last run came to (verdicts, plot put back, P1-46), its
// delivery to the forge (PS-08c), then its description.
// (PS-06b) A plan quest's brief comes apart from the rest of its description, with its plan's summary while the plan
// waits for the seal.
// (PS-28b) Its budget, the ceilings in force for the assignee and the judge as the breakers compute them, and the
// stamina bar of its running session.
import type { Event, Quest, Registry, ScopeWait } from '@elvaria/domain';
import type { MessageKey } from '@elvaria/i18n';
import { inKingdom } from '@elvaria/store';

import { EXIT } from '../command-table/command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { QUEST_STATUS_LABEL } from '../labels.ts';
import { NONE } from '../listing.ts';
import { renderTable } from '../listing/table.ts';
import { ceilingLines, ceilingRulesOf } from './ceiling.ts';
import { deliveryLines } from './delivery-view.ts';
import { infirmaryLines, journalOf, lastInfirmaryOf } from './infirmary.ts';
import { healLines, healMark } from './heal.ts';
import { lastRunLines } from './last-run.ts';
import { kindName } from './list.ts';
import { partyFields } from './party.ts';
import { planViewOf } from './plan-view.ts';
import { namedQuest } from './references.ts';
import { baseWaitsOf } from './base-wait.ts';
import { scopeWaitText, scopeWaitsOf } from './scope.ts';
import { sealText } from './seal-view.ts';
import { staminaLines } from './stamina-view.ts';
import { unclaimableLines, unclaimableOf } from './unclaimable.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

const listed = (values: readonly string[]): string => (values.length === 0 ? NONE : values.join(', '));

/**
 * The status, with the reason `quest list` gives for a quest that waits on its territory's scope rules
 * (scopeWaitText), or the mark of a quest in its run's heal (ADR 0034).
 */
function statusText(ctx: KingdomContext, quest: Quest, wait: ScopeWait | undefined): string {
  const mark = wait === undefined ? healMark(ctx.t, quest) : scopeWaitText(ctx, wait);
  return `${ctx.t(QUEST_STATUS_LABEL[quest.status])} (${quest.status})${mark === undefined ? '' : ` (${mark})`}`;
}

function fields(
  ctx: KingdomContext,
  registry: Registry | undefined,
  quest: Quest,
  quests: readonly Quest[],
  wait: ScopeWait | undefined,
): [MessageKey, string][] {
  const { t } = ctx;
  return [
    ['cli.quest.field.status', statusText(ctx, quest, wait)],
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
    // What the owner set; the ceilings in force come after the fields (PS-28b).
    [
      'cli.quest.field.budget',
      t('cli.quest.budget.value', {
        tokens: quest.budget.max_tokens,
        minutes: quest.budget.max_minutes,
        attempts: quest.budget.max_attempts,
      }),
    ],
    ['cli.quest.field.depends_on', listed(quest.depends_on)],
    ...heldFields(ctx, quest),
    // Spared by the kingdom's delegation, or raised by the machine since and why (PS-08b).
    ['cli.quest.field.seal', sealText(t, quest)],
    // Why the seal, when the work changed a protected path (PS-04, ADR 0026).
    ...(quest.protected_changes === undefined
      ? []
      : [['cli.quest.field.protected', listed(quest.protected_changes)] satisfies [MessageKey, string]]),
    ['cli.quest.field.created', `${quest.created_at} (${quest.created_by})`],
    ['cli.quest.field.updated', quest.updated_at],
    ...(quest.blocked === undefined
      ? []
      : [['cli.quest.field.question', quest.blocked.question] satisfies [MessageKey, string]]),
    // The amendment the quest waits on, and who decides it now (PS-22b).
    ...(quest.blocked?.amendment === undefined
      ? []
      : [
          [
            'cli.quest.field.amendment',
            t(`cli.quest.amendment.${quest.blocked.amendment.by}`, { memo: quest.blocked.amendment.memo }),
          ] satisfies [MessageKey, string],
        ]),
    ...deliveryFields(ctx, quest),
  ];
}

/** Since when the owner holds the quest, and why when it said (fix/quest-hold). */
function heldFields(ctx: KingdomContext, quest: Quest): [MessageKey, string][] {
  const { held } = quest;
  if (held === undefined) return [];
  const value =
    held.reason === undefined
      ? ctx.t('cli.quest.held.value', { at: held.at })
      : ctx.t('cli.quest.held.value_reason', { at: held.at, reason: held.reason });
  return [['cli.quest.field.held', value]];
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
  const quest = await namedQuest(input, ctx);
  if (quest === undefined) return EXIT.failed;
  const registry = await ctx.store.loadRegistry();
  // Where its party stands is read from every quest (P1-21 (c)); a file that cannot be read counts as none.
  const { items } = await ctx.store.quests.list();
  const wait = (await scopeWaitsOf(ctx, items)).get(quest.id);
  const rows = fields(ctx, registry.ok ? registry.value : undefined, quest, items, wait).map(
    ([label, value]) => [ctx.t(label), value],
  );
  const note = (await unclaimableOf(ctx, [quest])).get(quest.id);
  const why =
    note === undefined
      ? []
      : ['', ...(await unclaimableLines(ctx, registry.ok ? registry.value : undefined, quest, note))];
  const base = (await baseWaitsOf(ctx, items)).has(quest.id)
    ? ['', ctx.t('cli.quest.base_wait.why', { territory: quest.territory })]
    : [];
  const journal = await journalOf(ctx, quest);
  const sick = infirmaryNote(ctx, quest, journal);
  const last = await lastRunLines(ctx, quest, journal);
  const delivery = deliveryLines(ctx.t, quest, journal);
  const plan = await planViewOf(ctx, quest);
  const ceilings = await ceilingRulesOf(ctx, items);
  [
    `${quest.id}  ${quest.title}`,
    ...renderTable(rows),
    ...ceilingLines(ctx.t, quest, ceilings),
    ...staminaLines(ctx.t, quest, journal, ceilings),
    ...why,
    ...base,
    ...sick,
    ...healLines(ctx.t, quest, journal),
    ...last,
    ...delivery,
    ...plan.lines,
    '',
    ...(plan.lines.length === 0 ? [] : [ctx.t('cli.quest.show.description')]),
    plan.description,
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
