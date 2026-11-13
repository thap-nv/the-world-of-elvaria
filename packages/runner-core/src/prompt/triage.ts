// buildTriagePrompt: the Chancellor's triage of a batch of memos (implementation-plan §3.16.3, PS-03b; ADR 0024). Like
// the owner's words (chancellor.ts), a session with no tool: the memos with the quest whose letter held each, the
// quests a merge may name, and what a draft may name. Its reply is the memo-triage structured output.
import { QUEST_TAGS_MAX } from '@elvaria/domain';
import type { Memo, Quest } from '@elvaria/domain';

import { LANGUAGE_NAMES, classBlock, decreeBlock } from './blocks.ts';
import { catalogOf, list, rosterOf, territoriesOf } from './chancellor.ts';
import { draftingValuesOf } from './drafting.ts';
import { fill, joinBlocks } from './templates.ts';
import type { BuiltPrompt } from '../runner/types.ts';
import type { ChancellorContext } from './chancellor.ts';
import type { PromptTemplates } from './templates.ts';

export interface TriageMemo {
  readonly memo: Memo;
  /** The quest whose letter held it; absent when its file is gone. */
  readonly source?: Quest;
}

// The council is the owner's words' alone: work a memo asks for is a single quest, or the owner's (PS-06).
export interface TriageContext extends Omit<
  ChancellorContext,
  'utterance' | 'mana' | 'council' | 'returned'
> {
  /** The batch, the oldest first. */
  readonly memos: readonly TriageMemo[];
  /** The quests a merge may name: draft or open (MERGEABLE_STATUSES). */
  readonly quests: readonly Quest[];
}

/** Enough of a quest's description to tell what it does; the rest stays in its file. */
const DESCRIPTION_CHARS = 400;

const paths = (globs: readonly string[] | undefined): string =>
  globs === undefined || globs.length === 0 ? 'none' : globs.map((glob) => `\`${glob}\``).join(', ');

/** Every line of `text` two spaces in, so a memo's own lines stay under its item. */
const indented = (text: string): string =>
  text
    .trim()
    .split(/\r?\n/)
    .map((line) => `  ${line}`.trimEnd())
    .join('\n');

function memoItem({ memo, source }: TriageMemo): string {
  const where =
    source === undefined
      ? `quest \`${memo.quest}\``
      : `quest \`${source.id}\` «${source.title}» (territory \`${source.territory}\`, scope ${paths(source.scope_paths)})`;
  return `- \`${memo.id}\` (${memo.kind}) from \`${memo.from}\`, on ${where}; files: ${paths(memo.refs)}\n${indented(memo.body)}`;
}

function questItem(quest: Quest): string {
  const text = quest.description.replace(/\s+/g, ' ').trim();
  const shown = text.length > DESCRIPTION_CHARS ? `${text.slice(0, DESCRIPTION_CHARS)}…` : text;
  const head = `- \`${quest.id}\` (${quest.status}, rank ${quest.rank}, kind ${quest.kind}, territory \`${quest.territory}\`): «${quest.title}»; scope: ${paths(quest.scope_paths)}`;
  return `${head}\n  ${shown}`;
}

export function buildTriagePrompt(context: TriageContext, t: PromptTemplates): BuiltPrompt {
  const language = LANGUAGE_NAMES[context.locale];
  const role = fill(t.triage, {
    context_budget_tokens: String(context.context_budget_tokens),
    tags_max: String(QUEST_TAGS_MAX),
    language,
    // PS-06: a new quest of the triage is a draft like the Chancellor's, in the same template.
    ...draftingValuesOf(t, { language, context_budget_tokens: context.context_budget_tokens }),
  });
  return {
    system: joinBlocks([
      decreeBlock(context.decree, t),
      role,
      classBlock(context.class_prompt, 'Chancellor', t),
    ]),
    user: fill(t['triage-context'], {
      memos: list(context.memos.map(memoItem), 'No memo.'),
      quests: list(context.quests.map(questItem), 'No open quest.'),
      territories: territoriesOf(context.territories),
      ...catalogOf(context.registry),
      roster: rosterOf(context.roster),
    }),
  };
}
