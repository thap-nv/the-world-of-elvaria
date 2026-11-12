// A territory's code graph at one commit (PS-21, ADR 0029): graphify's tree-sitter pass, no model, 0 mana. It reads
// a detached worktree of the territory kept for it (`graphSource`), never a quest's plot, which its character changes
// while the build runs, and writes into the kingdom (`.state/graphs/<territory>/<commit>/`), so no graph file reaches
// a diff or a check. A build starts from a copy of the newest graph built, and graphify extracts again only the files
// whose content changed (spike graphify-2026-11-12 §2); `--no-cluster` leaves out the report and the HTML page, which
// no command reads. One build per territory at a time: the source worktree is shared.
import { cp, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { acquireLock, inKingdom, kingdomLayout, pathExists } from '@elvaria/store';
import type { Territory } from '@elvaria/domain';

import { runProgram } from '../process/program.ts';
import { graphEnvOf } from './graph-env.ts';
import type { Git } from '../plot/git.ts';

/** Graphs kept per territory: the newest, for the quests still on older bases (about 10–18 MB each for Elvaria). */
export const GRAPH_KEEP = 3;
/** A full build took 12–26 s in the spike; a machine busy with checks may take several times that. */
export const GRAPH_TIMEOUT_MS = 15 * 60_000;
export const GRAPH_FILE = 'graph.json';
/** A build's reason when another holds the territory's lock: no failure, the caller asks again later. */
export const GRAPH_BUSY = 'another build of this territory is running';
/** A commit's folder name: a full object id, sha-1 or sha-256. */
const COMMIT = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const BUILDING = '.building';
const RM = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } as const;

/** graphify as `doctor --pin` found it (kingdom.programs.graphify). */
export interface GraphProgram {
  readonly path: string;
  readonly version: string;
  /** Words before graphify's own (a spec's fake runs as `node <script>`); none for the real one. */
  readonly args?: readonly string[];
}

/** The argv of one graphify command. */
export const graphArgv = (program: GraphProgram, words: readonly string[]): string[] => [
  program.path,
  ...(program.args ?? []),
  ...words,
];

export type GraphBuild =
  | {
      readonly ok: true;
      /** Native path of the graph's folder: a session's GRAPHIFY_OUT. */
      readonly dir: string;
      readonly commit: string;
      /** From graphify's summary line; null when it printed none. */
      readonly nodes: number | null;
      readonly edges: number | null;
      readonly duration_ms: number;
      /** The graph was there already: nothing ran. */
      readonly reused: boolean;
    }
  | { readonly ok: false; readonly commit: string; readonly reason: string };

export interface GraphBuildOptions {
  /** Native absolute path of the kingdom. */
  readonly root: string;
  readonly territory: Pick<Territory, 'id' | 'path'>;
  readonly commit: string;
  readonly program: GraphProgram;
  readonly git: Git;
  /** The host's minimal env (ADR 0013); graphEnvOf adds graphify's own names. */
  readonly env: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  readonly timeout_ms?: number;
}

/** Native path of the graph of `territory` at `commit`; it holds a graph once GRAPH_FILE is there. */
export const graphDirOf = (root: string, territory: Territory['id'], commit: string): string =>
  inKingdom(root, kingdomLayout.graph(territory, commit));

/** The graph folder when the graph of `commit` is built, else undefined. */
export async function builtGraph(
  root: string,
  territory: Territory['id'],
  commit: string,
): Promise<string | undefined> {
  const dir = graphDirOf(root, territory, commit);
  return (await pathExists(path.join(dir, GRAPH_FILE))) ? dir : undefined;
}

/** The detached worktree at `commit`: added the first time, moved to `commit` after, made again when it broke. */
async function sourceAt(git: Git, repo: string, source: string, commit: string): Promise<string | undefined> {
  if (await pathExists(path.join(source, '.git'))) {
    const moved = await git(source, ['checkout', '--quiet', '--detach', '--force', commit]);
    if (moved.code === 0) return undefined;
  }
  // No worktree there yet, or one that broke (its `.git` gone, a checkout refused): start it again.
  await rm(source, RM);
  await git(repo, ['worktree', 'prune']);
  await mkdir(path.dirname(source), { recursive: true });
  const added = await git(repo, ['worktree', 'add', '--quiet', '--detach', source, commit]);
  return added.code === 0 ? undefined : `git worktree add failed: ${added.stderr.trim()}`;
}

/** The commit folders of a territory, newest graph first. */
async function graphsNewestFirst(folder: string): Promise<string[]> {
  const names = (await readdir(folder).catch(() => [])).filter((name) => COMMIT.test(name));
  const dated = await Promise.all(
    names.map(async (name) => {
      const file = path.join(folder, name, GRAPH_FILE);
      const time = await stat(file).then(
        (info) => info.mtimeMs,
        () => undefined,
      );
      return time === undefined ? [] : [{ name, time }];
    }),
  );
  return dated
    .flat()
    .sort((a, b) => b.time - a.time)
    .map(({ name }) => name);
}

/** Drops the graphs past GRAPH_KEEP, never `kept`, and what a build that died left. */
async function prune(folder: string, kept: string): Promise<void> {
  const newest = await graphsNewestFirst(folder);
  const old = newest.filter((name) => name !== kept).slice(GRAPH_KEEP - 1);
  const leftovers = (await readdir(folder).catch(() => [])).filter((name) => name.endsWith(BUILDING));
  for (const name of [...old, ...leftovers]) await rm(path.join(folder, name), RM);
}

const SUMMARY = /Rebuilt[^:\n]*:\s*(\d+) nodes, (\d+) edges/;

/** The last lines of graphify's output, for the event and the owner. */
const tailOf = (text: string): string => text.trim().split('\n').slice(-3).join(' | ').slice(-400);

interface Work {
  readonly options: GraphBuildOptions;
  readonly source: string;
  readonly target: string;
  readonly folder: string;
}

/** graphify `update` into a copy of the newest graph (or an empty folder), then the copy takes the commit's name. */
async function runBuild({ options, source, target, folder }: Work): Promise<GraphBuild> {
  const { commit, program } = options;
  const building = `${target}${BUILDING}`;
  await rm(building, RM);
  const seed = (await graphsNewestFirst(folder))[0];
  if (seed === undefined) await mkdir(building, { recursive: true });
  else await cp(path.join(folder, seed), building, { recursive: true });
  const run = await runProgram(graphArgv(program, ['update', source, '--no-cluster']), {
    cwd: source,
    env: graphEnvOf(options.env, program.path, building),
    timeout_ms: options.timeout_ms ?? GRAPH_TIMEOUT_MS,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  if (run.exit_code !== 0 || !(await pathExists(path.join(building, GRAPH_FILE)))) {
    await rm(building, RM);
    const why = run.start_error ?? (run.timed_out ? 'timed out' : tailOf(`${run.stdout}\n${run.stderr}`));
    return { ok: false, commit, reason: `graphify update failed (exit ${String(run.exit_code)}): ${why}` };
  }
  await rename(building, target);
  await prune(folder, commit);
  const summary = SUMMARY.exec(run.stdout);
  return {
    ok: true,
    dir: target,
    commit,
    nodes: summary === null ? null : Number(summary[1]),
    edges: summary === null ? null : Number(summary[2]),
    duration_ms: run.duration_ms,
    reused: false,
  };
}

/**
 * Builds the graph of the territory at `commit`, or finds it built. Never throws for what the territory or graphify
 * did: a failure is a value the Steward writes down as `graph.failed`, and the quest runs without the graph.
 */
export async function buildGraph(options: GraphBuildOptions): Promise<GraphBuild> {
  const { root, territory, commit } = options;
  if (!COMMIT.test(commit)) return { ok: false, commit, reason: `${commit} is not a full commit id` };
  const target = graphDirOf(root, territory.id, commit);
  if (await pathExists(path.join(target, GRAPH_FILE))) {
    return { ok: true, dir: target, commit, nodes: null, edges: null, duration_ms: 0, reused: true };
  }
  const lock = await acquireLock(inKingdom(root, kingdomLayout.graphLock(territory.id)), { wait: false });
  if (!lock.ok) return { ok: false, commit, reason: GRAPH_BUSY };
  try {
    const source = inKingdom(root, kingdomLayout.graphSource(territory.id));
    const broken = await sourceAt(options.git, territory.path, source, commit);
    if (broken !== undefined) return { ok: false, commit, reason: broken };
    const folder = inKingdom(root, kingdomLayout.graphs(territory.id));
    return await runBuild({ options, source, target, folder });
  } catch (error) {
    return { ok: false, commit, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    await lock.value.release();
  }
}
