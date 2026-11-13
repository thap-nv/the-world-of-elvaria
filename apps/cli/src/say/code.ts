// What the Chancellor learns of the code before it drafts (implementation-plan §3.11, PS-21b), at 0 mana: in every
// git territory, the files the owner's words name, from its working tree, whatever `code_graph` says (P1-50 (a): the
// Chancellor estimated without file sizes); and where the territory has `code_graph` on and graphify built its graph
// at the default branch's tip, what `graphify query` answers to the code names of the words, and the impact of the
// named files (impactOf). No graph is built here: the Steward builds the tip's at every tick (PS-21), and
// `elvaria territory graph` builds it on demand. Whatever cannot be read is left out, never an error of `say`.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { impactOf } from '@elvaria/domain';
import { NAMED_FILES_SHOWN, answerFilesOf, globToRegExp, readGraphLinks, zList } from '@elvaria/runner-core';
import { fromPortable } from '@elvaria/store';
import type { Territory } from '@elvaria/domain';
import type {
  CodeGraphs,
  Git,
  GraphAnswer,
  GraphFile,
  NamedPath,
  SizedFile,
  TerritoryCode,
} from '@elvaria/runner-core';

import { codeWordsOf, namedPathsOf } from './words.ts';

/** The graph's files given a size: those the Chancellor's block shows. */
const GRAPH_FILES_SIZED = 12;

export interface CodeSources {
  /** git as the plots run it; undefined on a machine without git, and then no file is named. */
  readonly git: Git | undefined;
  /** The pinned graphify's port; undefined without one, and then no territory has a graph block. */
  readonly graphs: CodeGraphs | undefined;
  readonly platform: NodeJS.Platform;
}

/** The files git tracks in the territory's working tree, `/` apart; none when git cannot say. */
async function trackedFiles(git: Git, folder: string): Promise<string[]> {
  const run = await git(folder, ['ls-files', '-z', '--cached']);
  return run.code === 0 ? zList(run.stdout) : [];
}

/** The files a path of the words names: a glob's matches, the file itself, a folder's files, or a name's files. */
function matchesOf(words: string, files: readonly string[]): string[] {
  const glob = words.replaceAll('\\', '/').replace(/^(?:\.\/|\/)+/, '');
  if (/[*?[{]/.test(glob)) {
    const pattern = globToRegExp(glob);
    return files.filter((file) => pattern.test(file));
  }
  const folder = `${glob.replace(/\/+$/, '').toLowerCase()}/`;
  const name = `/${glob.toLowerCase()}`;
  const bare = !glob.includes('/');
  return files.filter((file) => {
    const lower = file.toLowerCase();
    return lower === glob.toLowerCase() || lower.startsWith(folder) || (bare && lower.endsWith(name));
  });
}

const bytesOf = async (root: string, file: string): Promise<number> =>
  stat(path.join(root, file)).then(
    (info) => info.size,
    () => -1,
  );

/** The file's size and lines; undefined when the working tree no longer holds it. */
async function sizedOf(root: string, file: string): Promise<SizedFile | undefined> {
  try {
    const text = await readFile(path.join(root, file));
    const breaks = text.reduce((count, byte) => count + Number(byte === 0x0a), 0);
    const lines = breaks + Number(text.length > 0 && text.at(-1) !== 0x0a);
    return { path: file, bytes: text.length, lines };
  } catch {
    return undefined;
  }
}

/** Each path of the words that names a file of the territory, with its count, size and largest files. */
async function namedOf(
  words: readonly string[],
  files: readonly string[],
  root: string,
): Promise<NamedPath[]> {
  const named: NamedPath[] = [];
  for (const entry of words) {
    const matched = matchesOf(entry, files);
    const sizes = await Promise.all(
      matched.map(async (file) => ({ file, bytes: await bytesOf(root, file) })),
    );
    const present = sizes.filter(({ bytes }) => bytes >= 0).sort((a, b) => b.bytes - a.bytes);
    if (present.length === 0) continue;
    const largest = await Promise.all(
      present.slice(0, NAMED_FILES_SHOWN).map(({ file }) => sizedOf(root, file)),
    );
    named.push({
      words: entry,
      files: present.length,
      bytes: present.reduce((sum, { bytes }) => sum + bytes, 0),
      largest: largest.flatMap((file) => (file === undefined ? [] : [file])),
    });
  }
  return named;
}

interface GraphAsk {
  readonly graphs: CodeGraphs;
  readonly territory: Territory;
  readonly root: string;
  readonly question: readonly string[];
  /** The files the named paths match: the area whose impact is counted; none, and there is no impact line. */
  readonly area: ReadonlySet<string>;
}

/** The graph's answer at the tip, with sizes and the impact; undefined without a graph or anything it says. */
async function graphOf({
  graphs,
  territory,
  root,
  question,
  area,
}: GraphAsk): Promise<GraphAnswer | undefined> {
  const commit = await graphs.head(territory);
  const dir = commit === null ? undefined : await graphs.built(territory.id, commit);
  if (commit === null || dir === undefined) return undefined;
  const answer =
    question.length === 0 ? undefined : await graphs.ask(dir, ['query', question.join(' ')], root);
  const found = answer?.exit_code === 0 ? answerFilesOf(answer.stdout) : [];
  const files: GraphFile[] = await Promise.all(
    found.map(async (file, index) => {
      const size = index < GRAPH_FILES_SIZED ? await sizedOf(root, file.path) : undefined;
      return size === undefined ? file : { ...file, size };
    }),
  );
  const links = area.size === 0 ? undefined : await readGraphLinks(dir);
  const impact = links === undefined ? undefined : impactOf(links, (file) => area.has(file));
  if (files.length === 0 && impact === undefined) return undefined;
  return { commit, question: question.join(' '), files, ...(impact === undefined ? {} : { impact }) };
}

/** What the code of each git territory says of the owner's words; a territory that says nothing is left out. */
export async function codeOf(
  territories: readonly Territory[],
  utterance: string,
  sources: CodeSources,
): Promise<TerritoryCode[]> {
  const { git, graphs } = sources;
  const paths = namedPathsOf(utterance);
  const question = codeWordsOf(utterance);
  const code: TerritoryCode[] = [];
  for (const territory of territories) {
    if (territory.vcs.type !== 'git' || git === undefined) continue;
    const root = fromPortable(territory.path, sources.platform);
    const files = paths.length === 0 ? [] : await trackedFiles(git, root);
    const named = await namedOf(paths, files, root);
    const area = new Set(paths.flatMap((entry) => matchesOf(entry, files)));
    const graph =
      graphs === undefined || territory.code_graph !== true
        ? undefined
        : await graphOf({ graphs, territory, root, question, area });
    if (named.length > 0 || graph !== undefined)
      code.push({ territory: territory.id, named, ...(graph === undefined ? {} : { graph }) });
  }
  return code;
}
