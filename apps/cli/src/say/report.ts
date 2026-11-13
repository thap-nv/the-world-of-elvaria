// What `elvaria say` tells the owner (implementation-plan §3.11): why the Chancellor could not answer, the drafts it
// dropped and why, the drafts sent to the Steward with the quest id each will have, and its one question.
import type { ChancellorFailure, DraftCommand, DropReason, DroppedDraft } from '@elvaria/chancellor';
import type { MessageKey } from '@elvaria/i18n';

import { nameIn } from '../labels.ts';
import { NONE } from '../listing.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Brief, QuestId, Registry } from '@elvaria/domain';

export const DROP_REASON_LABEL: Readonly<Record<DropReason, MessageKey>> = {
  unknown_kind: 'cli.say.drop.unknown_kind',
  unknown_territory: 'cli.say.drop.unknown_territory',
  class_not_allowed: 'cli.say.drop.class_not_allowed',
  unknown_tag: 'cli.say.drop.unknown_tag',
  unknown_script: 'cli.say.drop.unknown_script',
  script_not_for_kind: 'cli.say.drop.script_not_for_kind',
  invalid_script_params: 'cli.say.drop.invalid_script_params',
  over_context_budget: 'cli.say.drop.over_context_budget',
  secret_not_allowed: 'cli.say.drop.secret_not_allowed',
  party_part: 'cli.say.drop.party_part',
  needs_dropped_draft: 'cli.say.drop.needs_dropped_draft',
  dependency_cycle: 'cli.say.drop.dependency_cycle',
  template: 'cli.say.drop.template',
  needs_council: 'cli.say.drop.needs_council',
  needs_brief: 'cli.say.drop.needs_brief',
  brief_not_on_plan: 'cli.say.drop.brief_not_on_plan',
};

/**
 * The Chancellor gave nothing usable; `run_dir` holds its prompt and the CLI's output. `contract`: the reply's,
 * quest-draft for the owner's words, memo-triage for the triage (PS-03b).
 */
export function reportFailure(
  ctx: KingdomContext,
  failure: ChancellorFailure,
  runDir: string,
  contract = 'quest-draft',
): void {
  const { t, io } = ctx;
  if (failure.code === 'rate_limited') io.err(t('cli.say.failed.rate_limited'));
  else if (failure.code === 'timed_out') io.err(t('cli.say.failed.timed_out'));
  else if (failure.code === 'stopped') io.err(t('cli.say.failed.stopped'));
  else if (failure.code === 'no_reply') io.err(t('cli.say.failed.no_reply', { outcome: failure.outcome }));
  else {
    io.err(t('cli.say.failed.invalid_reply', { contract }));
    failure.issues.forEach((issue) => {
      io.err(`  ${issue}`);
    });
  }
  io.err(t('cli.say.run_dir', { dir: runDir }));
}

export function reportDropped(ctx: KingdomContext, dropped: readonly DroppedDraft[]): void {
  for (const draft of dropped) {
    const reason = ctx.t(DROP_REASON_LABEL[draft.reason], { detail: draft.detail ?? '' });
    ctx.io.err(ctx.t('cli.say.dropped', { title: draft.title, reason }));
  }
}

/** Who does a draft: its class in the owner's language, or the script of a script-tier quest. */
function doerOf(
  ctx: KingdomContext,
  registry: Registry,
  payload: DraftCommand['command']['payload'],
): string {
  if (payload.script !== undefined) return ctx.t('cli.say.by_script', { script: payload.script.id });
  const klass = registry.classes.find(({ id }) => id === payload.class_required);
  return klass === undefined ? String(payload.class_required) : nameIn(ctx.locale, klass);
}

export function reportSent(ctx: KingdomContext, registry: Registry, sent: readonly DraftCommand[]): void {
  for (const { quest, command } of sent) {
    const { payload } = command;
    ctx.io.out(
      ctx.t('cli.say.drafted', {
        id: quest,
        title: payload.title,
        kind: payload.kind,
        rank: payload.rank,
        doer: doerOf(ctx, registry, payload),
      }),
    );
  }
  ctx.io.out(ctx.t('cli.say.confirm_hint', { id: sent[0]?.quest ?? '' }));
}

/**
 * The council's brief (PS-06): what the Chancellor understood and every question, each with its recommended answer,
 * which confirming the plan quest accepts. `quest` is the plan quest the brief opens.
 */
export function reportBrief(ctx: KingdomContext, brief: Brief | undefined, quest: QuestId | undefined): void {
  if (brief === undefined || quest === undefined) return;
  const { t, io } = ctx;
  const items = (lines: readonly string[]): string => (lines.length === 0 ? NONE : lines.join('; '));
  io.out(t('cli.say.brief.title', { id: quest }));
  io.out(t('cli.say.brief.goal', { goal: brief.goal }));
  io.out(t('cli.say.brief.out_of_scope', { items: items(brief.out_of_scope) }));
  io.out(t('cli.say.brief.acceptance', { items: items(brief.acceptance_examples) }));
  io.out(t('cli.say.brief.assumptions', { items: items(brief.assumptions) }));
  for (const { question, recommended } of brief.questions)
    io.out(t('cli.say.brief.question', { question, recommended }));
  io.out(t('cli.say.brief.confirm_hint', { id: quest }));
}

export function reportQuestion(ctx: KingdomContext, question: string | undefined): void {
  if (question === undefined) return;
  ctx.io.out(ctx.t('cli.say.question', { question }));
  ctx.io.out(ctx.t('cli.say.answer_hint'));
}
