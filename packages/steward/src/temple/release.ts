// The Temple frees a character (PS-12g, temple-first plan DB13 as the owner settled it): once a temple report is applied,
// the Steward reads the scriptures and its suspension book and releases (`temple_done`, §2.6, a `character.release` line of its
// own) every character suspended for a fail streak whose fail kind a new line of the report now cures in a session of it
// (templeReleasesOf). The lines are named by the ids the report's operations make, not by the lines written now: a report
// applied again after a stop writes nothing new and still frees the character.
import { createHash } from 'node:crypto';

import { lessonIdOf, templeLessonKeyOf, templeReleasesOf } from '@elvaria/domain';
import type { CharacterId, InboxCommandOf, LessonId } from '@elvaria/domain';

import { step } from '../record.ts';
import { readScriptures, templeStateOf } from './scriptures.ts';
import type { Context } from '../context.ts';

type TempleReport = InboxCommandOf<'temple_report'>;

/** The hash a new line's id is made with, as memo ids are (lessonIdOf). */
const digestOf = (key: string): Uint8Array => createHash('sha256').update(key).digest();

/** The id the operation at `index` gives its new line: from the report's command, so the same on every pass. */
export const newLineIdOf = (command: TempleReport, index: number): LessonId =>
  lessonIdOf(command.ts, digestOf(templeLessonKeyOf(command.id, index)));

const warn = (ctx: Context, command: TempleReport, message: string): void => {
  ctx.deps.log.warn(`steward: temple report ${command.id}: ${message}`);
};

/** Releases the characters the applied report frees; those released, in the order of the world. */
export async function releaseFreed(ctx: Context, command: TempleReport): Promise<CharacterId[]> {
  const files = await readScriptures(ctx);
  if (typeof files === 'string') {
    warn(ctx, command, `no character is released: ${files}`);
    return [];
  }
  const { vocabulary, os } = templeStateOf(ctx, files);
  const added = command.payload.operations.flatMap((operation, index) =>
    operation.op === 'retire' ? [] : [newLineIdOf(command, index)],
  );
  const freed = templeReleasesOf({
    files,
    added,
    characters: [...ctx.world.characters.values()],
    streak: [...ctx.streak.suspended],
    vocabulary,
    os,
  });
  const released: CharacterId[] = [];
  for (const id of freed) {
    const done = await ctx.record.change(id, 'character.release', step('temple_done'));
    if (done.ok) released.push(id);
    else warn(ctx, command, `${id} is not released: ${done.error}`);
  }
  return released;
}
