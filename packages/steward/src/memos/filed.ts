// The memos filed from a quest's letters, for the prompt of its next session (PS-02, ADR 0024): the session sees
// what it wrote is on its way and does not write it again in other words.
import type { QuestId } from '@elvaria/domain';
import type { FiledMemo } from '@elvaria/runner-core';

import { memosOfQuest } from './objection.ts';
import type { Context } from '../context.ts';

/** Oldest first; a memo file that cannot be read is left out, as listings do. */
export async function filedMemosOf(ctx: Context, quest: QuestId): Promise<FiledMemo[]> {
  const memos = await memosOfQuest(ctx, quest);
  return memos.map(({ id, kind, body, state }) => ({ id, kind, body, state }));
}
