// A territory without git gets a folder in the kingdom, `quests/<id>/work/` (implementation-plan §3.3, ADR 0012);
// delivery copies the deliverable into territory.path on purpose. Nothing to commit and nothing to release: the
// folder stays with the quest's other files.
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { Plot, QuestId } from '@elvaria/domain';
import { inKingdom, kingdomLayout, pathExists, toPortable } from '@elvaria/store';

/** Portable, relative to the kingdom. */
export const folderPlotOf = (questId: QuestId): string => `${kingdomLayout.questDir(questId)}/work`;

export async function prepareFolder(
  kingdom: string,
  questId: QuestId,
): Promise<{ readonly plot: Plot; readonly created: boolean }> {
  const relative = folderPlotOf(questId);
  const folder = inKingdom(kingdom, relative);
  const created = !(await pathExists(folder));
  await mkdir(folder, { recursive: true });
  return { plot: { type: 'folder', path: relative }, created };
}

/** Every file in the folder, relative to it with `/`: without git, all of it is the quest's work. */
export async function filesIn(folder: string): Promise<string[]> {
  if (!(await pathExists(folder))) return [];
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => toPortable(path.relative(folder, path.join(entry.parentPath, entry.name))))
    .sort();
}
