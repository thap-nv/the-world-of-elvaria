// A copy of a kingdom's settings for the trial of a new build (PS-04b): the new build's `migrate`, `doctor` and
// conformance suites run on it, so a build that needs a migration (a registry file it requires, as
// `registry/memos.json` since PS-02, or a newer version of a file) is tried as it will run after its migrate, and the
// kingdom itself is written only once the pointer has moved. Quests, the event log, the inbox and `.state/` stay
// out: doctor needs none of them (the mana gauges then read "not measured"), and they grow with every day.
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

/** What doctor and `tribe check` read of a kingdom, besides the files the paths in it name. */
const MIRRORED = ['kingdom.json', 'decree.md', 'registry', 'territories', 'characters', 'adapters'] as const;

const isMissing = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

export async function mirrorKingdom(root: string, into: string): Promise<void> {
  await mkdir(into, { recursive: true });
  for (const entry of MIRRORED) {
    try {
      await cp(path.join(root, entry), path.join(into, entry), { recursive: true });
    } catch (error) {
      // decree.md and adapters/ are optional; a kingdom without them is still a kingdom.
      if (!isMissing(error)) throw error;
    }
  }
}
