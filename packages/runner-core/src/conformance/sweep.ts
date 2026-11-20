// Clears what a killed conformance turn left behind. openWorkspace() removes only its own folder, so a turn killed
// midway (or one whose cleanup gave up on EBUSY, workspace.ts) leaves `elvaria conformance *` in the temp folder for good.
import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

/** The name openWorkspace gives its folder (mkdtemp adds a random tail). */
export const WORKSPACE_PREFIX = 'elvaria conformance ';
/** A check's ceiling is minutes, so a folder this old belongs to no live turn; a younger one may be another turn's. */
export const STALE_AFTER_MS = 60 * 60 * 1000;

export interface SweepOptions {
  /** The folder the workspaces live in (`os.tmpdir()`), injected for tests. */
  readonly tmp: string;
  /** The clock, in epoch milliseconds, injected for tests. */
  readonly now: () => number;
  readonly staleAfterMs?: number;
}

/**
 * Removes the workspaces in `tmp` that were last touched more than an hour ago; returns how many went. Best effort:
 * a folder that cannot be listed, read or removed (a turn still holds it) is left, never an error.
 */
export async function sweepStaleWorkspaces(options: SweepOptions): Promise<number> {
  const staleAfter = options.staleAfterMs ?? STALE_AFTER_MS;
  const names = await readdir(options.tmp).catch(() => [] as string[]);
  const results = await Promise.all(
    names
      .filter((name) => name.startsWith(WORKSPACE_PREFIX))
      .map(async (name) => {
        const folder = path.join(options.tmp, name);
        try {
          const info = await stat(folder);
          if (!info.isDirectory() || options.now() - info.mtimeMs <= staleAfter) return false;
          await rm(folder, { recursive: true, force: true });
          return true;
        } catch {
          return false;
        }
      }),
  );
  return results.filter(Boolean).length;
}
