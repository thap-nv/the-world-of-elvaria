// count-files: files and lines per folder for the given globs (produces: report).
// Params: { globs: string[] }. Output: { summary, data: { files, lines, folders: { <folder>: { files, lines } } } },
// folders sorted, `.` for the plot root.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cli, globFiles, stringList } from './common.mjs';

const NEWLINE = 0x0a;

/** Lines as an editor counts them: a last line without a newline still counts. @param {Buffer} bytes */
export function countLines(bytes) {
  let lines = 0;
  for (const byte of bytes) if (byte === NEWLINE) lines += 1;
  return bytes.length > 0 && bytes[bytes.length - 1] !== NEWLINE ? lines + 1 : lines;
}

/** @type {import('./common.mjs').ScriptBody} */
export function run(params, _context, cwd) {
  const files = globFiles(cwd, stringList(params, 'globs'));
  /** @type {Map<string, { files: number; lines: number }>} */
  const folders = new Map();
  let lines = 0;
  for (const file of files) {
    const count = countLines(readFileSync(path.join(cwd, file)));
    const folder = path.posix.dirname(file);
    const total = folders.get(folder) ?? { files: 0, lines: 0 };
    folders.set(folder, { files: total.files + 1, lines: total.lines + count });
    lines += count;
  }
  // Code-unit order, not the machine's locale: the same plot gives the same report everywhere.
  const sorted = Object.fromEntries([...folders].sort(([a], [b]) => (a < b ? -1 : 1)));
  return {
    summary: `${files.length} files, ${lines} lines in ${folders.size} folders`,
    data: { files: files.length, lines, folders: sorted },
  };
}

if (import.meta.main) await cli(run);
