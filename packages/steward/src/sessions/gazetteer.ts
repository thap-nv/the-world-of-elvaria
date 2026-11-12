// The gazetteer a session's prompt quotes (PS-21): as the kingdom has it, or, when its first line stamps the commit
// it was written at, without the stamp and with how many commits touched each top-level folder since, up to the
// commit the quest's branch forked from (Plots.drift). A drift that cannot be read costs the note, never the prompt.
import { gazetteerStampOf, gazetteerWithDrift } from '@elvaria/runner-core';
import type { Quest, Territory } from '@elvaria/domain';

import { readGazetteer } from '../files.ts';
import type { Context } from '../context.ts';

export async function gazetteerFor(ctx: Context, quest: Quest, territory: Territory): Promise<string | null> {
  const text = await readGazetteer(ctx.root, territory.id);
  if (text === null) return null;
  const stamp = gazetteerStampOf(text);
  if (stamp === undefined) return text;
  try {
    return gazetteerWithDrift(text, (await ctx.deps.plots.drift?.(quest.plot, stamp)) ?? null);
  } catch (error) {
    ctx.deps.log.warn(
      `steward: ${quest.id}: no drift of the gazetteer: ${error instanceof Error ? error.message : String(error)}`,
    );
    return gazetteerWithDrift(text, null);
  }
}
