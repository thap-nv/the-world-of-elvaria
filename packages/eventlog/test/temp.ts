// Throwaway folders in the OS temp folder. The name has a space on purpose: real kingdoms live in paths like
// `D:\Dummy\Tool - Personal\…`.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface TempDir {
  readonly root: string;
  remove(): Promise<void>;
}

export async function tempDir(): Promise<TempDir> {
  const root = await mkdtemp(path.join(tmpdir(), 'elvaria events '));
  return { root, remove: () => rm(root, { recursive: true, force: true }) };
}

/** Writes raw text, as a crashed or foreign writer would leave it. */
export async function plantText(file: string, text: string, append = false): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, { encoding: 'utf8', flag: append ? 'a' : 'w' });
}

export const linesOf = async (file: string): Promise<string[]> =>
  (await readFile(file, 'utf8')).split('\n').filter((line) => line !== '');

/** Native path of a script in this folder, for `node <script>` children (Node runs .ts by type stripping). */
export const testScript = (name: string): string => fileURLToPath(new URL(name, import.meta.url));
