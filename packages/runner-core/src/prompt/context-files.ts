// territory.context_files in the prompt (implementation-plan §3.14 `context: prompt`, P1-33): a tribe whose CLI
// loads no instruction file of its own (CLAUDE.md, GEMINI.md, AGENTS.md) reads the territory's law and rules in the
// system part, as they stand in the plot. The globs read like the territory's other globs (globToRegExp); a file is
// cut at the size agy embeds (cli-facts §2.3), so a large README cannot crowd out the quest.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { globToRegExp } from '../checks/glob.ts';
import { fenced, fill } from './templates.ts';
import type { PromptTemplates } from './templates.ts';
import type { Territory } from '@elvaria/domain';

/** One file of `territory.context_files`, relative to the plot with `/`, and its text. */
export interface ContextFile {
  readonly path: string;
  readonly text: string;
}

/** What one file may bring into the prompt: what agy embeds of a context file (24 000 bytes). */
export const CONTEXT_FILE_MAX_CHARS = 24_000;

const WILDCARD = /[*?[{]/;

/** Every file below `dir`, relative with `/`; skips `.git` and `node_modules`, which no context glob means. */
async function filesUnder(root: string, dir = ''): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(path.join(root, dir), { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relative = dir === '' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isFile()) return [relative];
      if (!entry.isDirectory() || entry.name === '.git' || entry.name === 'node_modules') return [];
      return filesUnder(root, relative);
    }),
  );
  return nested.flat();
}

/** The folder a glob cannot leave: its segments before the first wildcard. */
const baseOf = (glob: string): string => {
  const parts = glob.split('/');
  const fixed = parts.slice(
    0,
    parts.findIndex((part) => WILDCARD.test(part)),
  );
  return fixed.join('/');
};

/**
 * The paths `patterns` name in the plot, in the patterns' order (each glob's matches sorted), once each. A path
 * without a wildcard is named as it is: the read finds out whether it is there.
 */
export async function contextPathsIn(plot: string, patterns: readonly string[]): Promise<string[]> {
  const found: string[] = [];
  for (const raw of patterns) {
    const glob = raw.replaceAll('\\', '/').replace(/^\.\//, '');
    const matches = WILDCARD.test(glob)
      ? (await filesUnder(plot, baseOf(glob))).filter((file) => globToRegExp(glob).test(file)).sort()
      : [glob];
    for (const file of matches) if (!found.includes(file)) found.push(file);
  }
  return found;
}

/** The files `patterns` name in the plot, each cut at CONTEXT_FILE_MAX_CHARS; a file that cannot be read is left out. */
export async function readContextFiles(plot: string, patterns: readonly string[]): Promise<ContextFile[]> {
  const files: ContextFile[] = [];
  for (const file of await contextPathsIn(plot, patterns)) {
    try {
      const text = await readFile(path.join(plot, ...file.split('/')), 'utf8');
      const cut = text.length > CONTEXT_FILE_MAX_CHARS;
      files.push({ path: file, text: cut ? `${text.slice(0, CONTEXT_FILE_MAX_CHARS)}\n[… cut]` : text });
    } catch {
      // A file gone between the listing and the read says nothing.
    }
  }
  return files;
}

/** The block of the system part; empty when the tribe loads them itself (undefined) or none is in the plot. */
export function contextFilesBlock(
  territory: Territory,
  files: readonly ContextFile[] | undefined,
  t: PromptTemplates,
): string {
  const present = (files ?? []).filter(({ text }) => text.trim() !== '');
  if (present.length === 0) return '';
  const sections = present.map((file) => `## ${file.path}\n\n${fenced(file.text.trim(), 'markdown')}`);
  return fill(t['context-files'], { territory: territory.name, files: sections.join('\n\n') });
}
