// Throwaway folders for specs (architecture-health V7, K6). The name always has a space: real kingdoms and
// territories live in paths like `D:\Dummy\Tool - Personal\…` (implementation-plan §6).
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * How a spec removes its folder. On Windows a child that just ended or was killed (git, a check, a process tree)
 * or the indexer may hold it a moment longer (EBUSY, EPERM, ENOTEMPTY): rm retries, back-off up to 5.5 s (P1-39).
 * The same numbers as `RM_RETRY` of @elvaria/store, which running code uses; testkit imports no workspace (K6),
 * so the two are copies and store's remove.spec.ts checks they agree (R7).
 */
export const RM_TEMP = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 } as const;

export interface TempDir {
  /** Native absolute path of the folder. */
  readonly root: string;
  /** Removes the folder and everything in it; a folder already gone is fine. */
  remove(): Promise<void>;
}

/** A new folder `elvaria <label> <random>` in the OS temp folder. */
export async function tempDir(label: string): Promise<TempDir> {
  const root = await mkdtemp(path.join(tmpdir(), `elvaria ${label} `));
  return { root, remove: () => rm(root, RM_TEMP) };
}
