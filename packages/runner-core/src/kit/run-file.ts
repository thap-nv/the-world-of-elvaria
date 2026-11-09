// A file of one run, for an adapter file that imports nothing (P1-19): its CLI's settings, the prompt, a JSON
// Schema. Per-run configuration lives in `<kingdom>/.runs/<quest>-<n>/` and nowhere else (ADR 0013, rules of
// runner-*), so the name is a plain file name: no folder, no `..`, nothing that leaves the run folder.
import path from 'node:path';

import { writeFileAtomic } from '@elvaria/store';

import type { AbsolutePath } from '../runner/types.ts';

const PLAIN_NAME = /^[\w][\w.-]*$/;

/** Writes `content` to `<runDir>/<name>` and resolves with the file's absolute path. */
export async function writeRunFile(
  runDir: AbsolutePath,
  name: string,
  content: string,
): Promise<AbsolutePath> {
  if (!PLAIN_NAME.test(name) || name.includes('..'))
    throw new Error(`run file ${name}: a plain file name inside the run folder`);
  const file = path.join(runDir, name);
  await writeFileAtomic(file, content);
  return file;
}
