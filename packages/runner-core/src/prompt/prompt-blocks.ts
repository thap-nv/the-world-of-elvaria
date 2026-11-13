// The blocks a prompt is made of, by id and size (PS-01b, implementation-plan §3.16.1): the Steward writes them on the
// line that opens a session (its load trace), so the metrics ledger sees what each prompt carried. There is no token
// counter in the code, so a block's size is its characters. The text is joined exactly as joinBlocks joins it: the
// blocks only describe a prompt, they never change one.
import { joinBlocks } from './templates.ts';
import type { BuiltPrompt } from '../runner/types.ts';

/** Every block a prompt may carry: the system part's, then the user part's (build-prompt.ts, resumed.ts). */
export const PROMPT_BLOCK_IDS = [
  'decree',
  'role',
  'class',
  'context_files',
  // PS-21: the code graph a class that searches code may ask, when its territory has one built.
  'graph',
  'quest',
  'gazetteer',
  'scripture',
  'skills',
  'continuation',
  // PS-02: the memos a continuing assignee's quest filed, after the continuation they used to end.
  'memos',
  'partial',
  // PS-22: the verdict an objection contests and the objection, for its second judge.
  'objection',
  'review',
  'resumed',
  'answer',
] as const;
export type PromptBlockId = (typeof PROMPT_BLOCK_IDS)[number];

export type PromptPart = 'system' | 'user';

/** A block that made it into the prompt: an empty one is left out of the text, and of this list. */
export interface PromptBlock {
  readonly part: PromptPart;
  readonly id: PromptBlockId;
  /** Its length in characters as the prompt carries it, trimmed. */
  readonly chars: number;
}

/** A prompt and its blocks, the system part's first, each part's in order. */
export interface PromptWithBlocks extends BuiltPrompt {
  readonly blocks: readonly PromptBlock[];
}

/** A block's id and its text, empty when it has nothing to say. */
export type NamedBlock = readonly [id: PromptBlockId, text: string];

const blocksOf = (part: PromptPart, named: readonly NamedBlock[]): PromptBlock[] =>
  named.flatMap(([id, text]) => {
    const chars = text.trim().length;
    return chars === 0 ? [] : [{ part, id, chars }];
  });

/** The two parts joined as joinBlocks joins them, with the blocks they are made of. */
export const composed = (system: readonly NamedBlock[], user: readonly NamedBlock[]): PromptWithBlocks => ({
  system: joinBlocks(system.map(([, text]) => text)),
  user: joinBlocks(user.map(([, text]) => text)),
  blocks: [...blocksOf('system', system), ...blocksOf('user', user)],
});
