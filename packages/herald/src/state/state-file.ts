// The Herald's two files under .state/ (pairing codes, sessions): private to it and `elvaria herald pair`, so they
// carry a `version` but no contract in domain, like the Steward's .state/sessions.json. A missing, torn or unknown
// file reads as empty, which opens nothing: a session or a code it held is simply gone (closed when unsure).
import { inKingdom, readTextFile, withLock, writeFileAtomic } from '@elvaria/store';
import type { Result } from '@elvaria/domain';

export const STATE_FILE_VERSION = 1;
const JSON_INDENT = 2;

export interface StateFile<T> {
  /** Kingdom-relative path, `/`-separated. */
  readonly file: string;
  /** What the file holds when it is missing or unreadable. */
  readonly empty: () => T;
  /** The value inside a parsed file of this version, or undefined when it is not one. */
  readonly decode: (parsed: unknown) => T | undefined;
}

/** The value in `spec`'s file under `root`; empty when there is none worth reading. */
export async function readStateFile<T>(root: string, spec: StateFile<T>): Promise<T> {
  const text = await readTextFile(inKingdom(root, spec.file));
  if (text === undefined) return spec.empty();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return spec.empty();
  }
  const versioned = parsed as { version?: unknown } | null;
  if (versioned?.version !== STATE_FILE_VERSION) return spec.empty();
  return spec.decode(parsed) ?? spec.empty();
}

/**
 * Read → `change` → write under the file's lock, so the Herald and `elvaria herald pair` (two processes) never lose
 * each other's write. `change` returns the new value and what to answer; the file is written only when it says so.
 */
export async function updateStateFile<T, A>(
  root: string,
  spec: StateFile<T>,
  change: (current: T) => { readonly next?: T; readonly answer: A },
): Promise<Result<A, 'locked'>> {
  const target = inKingdom(root, spec.file);
  return withLock(target, async () => {
    const { next, answer } = change(await readStateFile(root, spec));
    if (next !== undefined)
      await writeFileAtomic(
        target,
        `${JSON.stringify({ version: STATE_FILE_VERSION, ...next }, null, JSON_INDENT)}\n`,
      );
    return answer;
  });
}
