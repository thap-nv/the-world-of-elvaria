// todo-scan: TODO, FIXME, HACK and XXX markers in the files matching the given globs (produces: report).
// Params: { globs: string[] }. Output: { summary, data: { files, total, by_kind: { <marker>: n }, items } },
// items sorted by file, then line, then position on the line: { file, line, kind }.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cli, globFiles, stringList } from './common.mjs';

export const MARKERS = Object.freeze(['TODO', 'FIXME', 'HACK', 'XXX']);

// Whole words only, upper case only: `todos` or `Todo` in prose is not a marker.
const MARKER = /\b(TODO|FIXME|HACK|XXX)\b/g;

/** One item per marker, so a line with two markers gives two items. @param {string} text */
export function scanText(text) {
  /** @type {{ line: number; kind: string }[]} */
  const found = [];
  text.split('\n').forEach((content, index) => {
    for (const match of content.matchAll(MARKER)) found.push({ line: index + 1, kind: match[1] ?? '' });
  });
  return found;
}

/** @type {import('./common.mjs').ScriptBody} */
export function run(params, _context, cwd) {
  const files = globFiles(cwd, stringList(params, 'globs'));
  /** @type {{ file: string; line: number; kind: string }[]} */
  const items = [];
  for (const file of files) {
    const bytes = readFileSync(path.join(cwd, file));
    // A NUL byte means binary: its bytes would only give false markers.
    if (bytes.includes(0)) continue;
    for (const { line, kind } of scanText(bytes.toString('utf8'))) items.push({ file, line, kind });
  }
  const byKind = Object.fromEntries(
    MARKERS.map((kind) => [kind, items.filter((item) => item.kind === kind).length]),
  );
  const withMarkers = new Set(items.map((item) => item.file)).size;
  return {
    summary: `${items.length} markers in ${withMarkers} of ${files.length} files`,
    data: { files: files.length, total: items.length, by_kind: byKind, items },
  };
}

if (import.meta.main) await cli(run);
