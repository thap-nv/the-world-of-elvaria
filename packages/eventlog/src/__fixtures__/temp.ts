// Throwaway folders in the OS temp folder. The name has a space on purpose: real kingdoms live in paths like
// `D:\Dummy\Tool - Personal\…`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tempDir as testkitTempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';

export type { TempDir } from '@elvaria/testkit';

export async function tempDir(): Promise<TempDir> {
  return testkitTempDir('events');
}

/** Writes raw text, as a crashed or foreign writer would leave it. */
export async function plantText(file: string, text: string, append = false): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, { encoding: 'utf8', flag: append ? 'a' : 'w' });
}

export const linesOf = async (file: string): Promise<string[]> =>
  (await readFile(file, 'utf8')).split('\n').filter((line) => line !== '');

/** Native path of a fixture script, for `node <script>` children (Node runs .ts by type stripping). */
export const testScript = (name: string): string =>
  fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));
