// The healer's note on the bell (plans/healer.md 4.4, HL-05): the `## Heal` section its session added to the letter,
// what it changed and why or why it could not mend the work, rung with the infirmary so the owner reads it first.
import { redact } from '@elvaria/eventlog';
import { HEAL_SECTION, sectionOf } from '@elvaria/runner-core';
import type { CharacterId, Quest } from '@elvaria/domain';

import { readHandover } from '../texts/files.ts';
import type { HealNote } from '../bell/notice.ts';
import type { Context } from '../context.ts';

/** The most of the note the bell prints; the letter keeps it whole. */
export const HEAL_NOTE_MAX_CHARS = 1200;

/** The healer's note, masked and cut (ADR 0013); none when its letter has no `## Heal` section or cannot be read. */
export async function healNoteOf(
  ctx: Context,
  quest: Quest,
  healer: CharacterId,
): Promise<{ readonly heal_note?: HealNote }> {
  try {
    const letter = await readHandover(ctx.root, quest.id);
    const section = letter === null ? undefined : sectionOf(letter, HEAL_SECTION);
    if (section === undefined) return {};
    const text = redact(section, []);
    const cut =
      text.length > HEAL_NOTE_MAX_CHARS ? `${text.slice(0, HEAL_NOTE_MAX_CHARS).trimEnd()} …` : text;
    return { heal_note: { healer, text: cut } };
  } catch {
    return {};
  }
}
