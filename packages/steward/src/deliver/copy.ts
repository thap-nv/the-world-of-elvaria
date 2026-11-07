// Delivery on a territory without git (implementation-plan §3.3, ADR 0012): the work in `quests/<id>/work/` is
// copied into `territory.path` on purpose. Without git nothing could bring back a file the copy overwrote, so a file
// the territory already has with other content is kept first in `.runs/<quest>-replaced/`; a file already equal is
// left alone, so a delivery repeated after a crash changes nothing twice. A territory folder that is not there gets
// nothing: the Steward never creates the owner's folders.
import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { fromPortable, inKingdom, pathExists, toPortable } from '@elvaria/store';
import type { QuestId } from '@elvaria/domain';

export interface Copied {
  /** Paths relative to the plot and the territory, with `/`: the files the territory now has as the quest left them. */
  readonly copied: readonly string[];
  /** Those whose earlier content the territory had is kept under `replacedDirOf(quest)`. */
  readonly replaced: readonly string[];
  /** The territory's folder was not there: nothing was copied. */
  readonly missing: boolean;
}

/** Portable, relative to the kingdom: where the files a delivery overwrote are kept. */
export const replacedDirOf = (quest: QuestId): string => `.runs/${quest}-replaced`;

async function isFolder(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/** Every file of the plot, relative to it with `/`, sorted. */
async function filesIn(folder: string): Promise<string[]> {
  if (!(await pathExists(folder))) return [];
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => toPortable(path.relative(folder, path.join(entry.parentPath, entry.name))))
    .sort();
}

const contentOf = async (file: string): Promise<Buffer | undefined> =>
  (await pathExists(file)) ? readFile(file) : undefined;

/** One file: copied, or copied after its earlier content was kept; true when that earlier content exists. */
async function copyOne(source: string, target: string, kept: string): Promise<boolean> {
  const [wanted, present] = await Promise.all([readFile(source), contentOf(target)]);
  if (present?.equals(wanted) === true) return pathExists(kept);
  if (present !== undefined) {
    await mkdir(path.dirname(kept), { recursive: true });
    await copyFile(target, kept);
  }
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  return present !== undefined;
}

/** Copies the plot folder (`plot`, portable, relative to the kingdom) into the territory at `territory` (absolute). */
export async function copyIntoTerritory(
  root: string,
  quest: QuestId,
  plot: string,
  territory: string,
): Promise<Copied> {
  const target = fromPortable(territory);
  if (!(await isFolder(target))) return { copied: [], replaced: [], missing: true };
  const work = inKingdom(root, plot);
  const copied: string[] = [];
  const replaced: string[] = [];
  for (const file of await filesIn(work)) {
    const kept = inKingdom(root, `${replacedDirOf(quest)}/${file}`);
    const over = await copyOne(
      path.join(work, fromPortable(file)),
      path.join(target, fromPortable(file)),
      kept,
    );
    copied.push(file);
    if (over) replaced.push(file);
  }
  return { copied, replaced, missing: false };
}
