// The kingdom's free-text files the store reads and masks (implementation-plan §2.2, §3.7, §3.9; ADR 0013). The
// royal decree is the owner's: Elvaria reads it for every prompt and never creates or changes it. The handover
// letter is a character's: once its session ends the Steward masks it with that session's secret values and the
// patterns, so a secret the character copied into it never reaches the next prompt or the owner's screen.
import { createRedactor } from '@elvaria/eventlog';
import type { QuestId } from '@elvaria/domain';

import { readTextFile, writeFileAtomic } from './io/atomic.ts';
import { kingdomLayout } from './layout.ts';
import { inKingdom } from './paths.ts';

/** `decree.md`, or null when the owner has written none. */
export async function readDecree(root: string): Promise<string | null> {
  return (await readTextFile(inKingdom(root, kingdomLayout.decree()))) ?? null;
}

/**
 * Masks `known` (the session's secret values) and the patterns in the quest's handover letter, rewriting it only
 * when something was masked. True when it was rewritten; false when there is no letter or nothing to mask.
 */
export async function redactHandover(
  root: string,
  quest: QuestId,
  known: readonly string[],
): Promise<boolean> {
  const file = inKingdom(root, kingdomLayout.handover(quest));
  const text = await readTextFile(file);
  if (text === undefined) return false;
  const masked = createRedactor(known)(text);
  if (masked === text) return false;
  await writeFileAtomic(file, masked);
  return true;
}
