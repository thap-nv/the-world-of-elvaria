// buildAmendmentPrompt (PS-22b, implementation-plan §3.16.2; ADR 0024): a doer contests its quest's description with
// an `amendment` memo, and whoever wrote the description decides it in a fresh session with no tool, like the
// Chancellor's: the quest, its description, the plan it came from, the amendment and the doer's letter. Its reply is
// the amendment-decision structured output. What the doer reads of the decision is amendment-answer.ts.
import { LANGUAGE_NAMES, classBlock, decreeBlock } from './blocks.ts';
import { draftingValuesOf } from './drafting.ts';
import { fill, joinBlocks } from './templates.ts';
import type { Memo, Quest } from '@elvaria/domain';
import type { BuiltPrompt } from '../runner/types.ts';
import type { Locale } from './blocks.ts';
import type { PromptTemplates } from './templates.ts';

/** Who wrote the description: the Chancellor, or the mage of the plan the quest came from. */
export type AmendmentAuthorRole = 'chancellor' | 'mage';

const ROLE_NAMES: Readonly<Record<AmendmentAuthorRole, { readonly author: string; readonly craft: string }>> =
  {
    chancellor: { author: 'the Chancellor of the kingdom of Elvaria', craft: 'Chancellor' },
    mage: {
      author: 'a mage of the kingdom of Elvaria, who planned the work this quest is part of',
      craft: 'Mage',
    },
  };

export interface AmendmentContext {
  readonly locale: Locale;
  readonly decree: string | null;
  readonly role: AmendmentAuthorRole;
  /** The author's class prompt in the kingdom (the Chancellor's, or the mage's), when it has one. */
  readonly class_prompt: string | null;
  readonly context_budget_tokens: number;
  readonly quest: Quest;
  readonly memo: Memo;
  /** The plan quest a mage's sub-quest came from: its description holds the brief the owner sealed (PS-06). */
  readonly plan?: Quest | undefined;
  /** The doer's handover letter as the run left it; null when it cannot be read. */
  readonly letter: string | null;
}

/** Enough of a plan's description or a letter to decide on; the rest stays in its file. */
export const AMENDMENT_TEXT_MAX = 8000;

const capped = (text: string): string =>
  text.length > AMENDMENT_TEXT_MAX ? `${text.slice(0, AMENDMENT_TEXT_MAX)}\n…` : text;

const paths = (refs: readonly string[]): string =>
  refs.length === 0 ? 'none' : refs.map((ref) => `\`${ref}\``).join(', ');

function questLines(quest: Quest): string {
  const scope = quest.scope_paths === undefined ? 'none' : paths(quest.scope_paths);
  return [
    `\`${quest.id}\` «${quest.title}»: kind ${quest.kind}, rank ${quest.rank}, territory \`${quest.territory}\`, scope ${scope}.`,
    `Run ${String(quest.attempts)} of ${String(quest.budget.max_attempts)}.`,
  ].join(' ');
}

function planBlock(plan: Quest | undefined): string {
  if (plan === undefined) return '';
  return `# The plan it came from\n\n\`${plan.id}\` «${plan.title}»:\n\n${capped(plan.description.trim())}`;
}

const amendmentLines = (memo: Memo): string =>
  `\`${memo.id}\` from \`${memo.from}\`, at the end of run ${String(memo.attempt)}; files: ${paths(memo.refs)}\n\n${memo.body.trim()}`;

export function buildAmendmentPrompt(context: AmendmentContext, t: PromptTemplates): BuiltPrompt {
  const language = LANGUAGE_NAMES[context.locale];
  const names = ROLE_NAMES[context.role];
  const { quest_template: questTemplate } = draftingValuesOf(t, {
    language,
    context_budget_tokens: context.context_budget_tokens,
  });
  return {
    system: joinBlocks([
      decreeBlock(context.decree, t),
      fill(t.amendment, { author: names.author, language, quest_template: questTemplate }),
      classBlock(context.class_prompt, names.craft, t),
    ]),
    user: fill(t['amendment-context'], {
      quest: questLines(context.quest),
      description: context.quest.description.trim(),
      plan: planBlock(context.plan),
      amendment: amendmentLines(context.memo),
      letter: context.letter === null ? 'The letter cannot be read.' : capped(context.letter.trim()),
    }),
  };
}
