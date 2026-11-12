// What the Steward and the CLI do with code graphs (PS-21, ADR 0029), behind one port the composition root makes
// when `doctor --pin` found graphify (kingdom.programs.graphify): a kingdom without it gets no port, and its quests
// run as before. The graph of a quest is the one at the commit its branch forked from (its plot record), so every
// session of the quest, assignee or judge, asks the same graph whatever the branch holds by then.
import { runProgram } from '../process/program.ts';
import { gitDirOf, readPlotRecord } from '../plot/plot-record.ts';
import { buildGraph, builtGraph, graphArgv, GRAPH_TIMEOUT_MS } from './build-graph.ts';
import { graphEnvOf } from './graph-env.ts';
import type { ProgramRun } from '../process/program.ts';
import type { Git } from '../plot/git.ts';
import type { GraphBuild, GraphProgram } from './build-graph.ts';
import type { Territory } from '@elvaria/domain';

/** A question to the graph answers in about a second (spike §3); a stuck one must not hold a CLI. */
export const GRAPH_ASK_TIMEOUT_MS = 60_000;

export interface CodeGraphs {
  readonly program: GraphProgram;
  /** The commit the quest branch of the plot at `plot` forked from; null without a plot record. */
  base(plot: string): Promise<string | null>;
  /** The commit at the tip of the territory's default branch; null without git or when git cannot say. */
  head(territory: Pick<Territory, 'path' | 'vcs'>): Promise<string | null>;
  /** The graph's folder when the graph of `commit` is built, else undefined. */
  built(territory: Territory['id'], commit: string): Promise<string | undefined>;
  build(territory: Pick<Territory, 'id' | 'path'>, commit: string, signal?: AbortSignal): Promise<GraphBuild>;
  /** `env` with what graphify needs to answer from the graph in `graphDir` (a session's env, graphEnvOf). */
  envFor(env: Readonly<Record<string, string>>, graphDir: string): Record<string, string>;
  /** One read-only command (`query`, `path`, `explain`, `affected` and their words) against the graph in `graphDir`. */
  ask(graphDir: string, args: readonly string[], cwd: string): Promise<ProgramRun>;
}

export interface CodeGraphsOptions {
  /** Native absolute path of the kingdom. */
  readonly root: string;
  readonly program: GraphProgram;
  readonly git: Git;
  /** The host's minimal env (ADR 0013). */
  readonly env: Readonly<Record<string, string>>;
  readonly timeout_ms?: number;
}

/** The base of the plot's record; a plot without one (a folder, a broken worktree) has no graph. */
async function baseOf(git: Git, plot: string): Promise<string | null> {
  try {
    return (await readPlotRecord(await gitDirOf(git, plot)))?.base ?? null;
  } catch {
    return null;
  }
}

async function headOf(git: Git, territory: Pick<Territory, 'path' | 'vcs'>): Promise<string | null> {
  const branch = territory.vcs.default_branch;
  if (territory.vcs.type !== 'git' || branch === undefined) return null;
  const run = await git(territory.path, ['rev-parse', '--verify', '--quiet', `${branch}^{commit}`]);
  const commit = run.stdout.trim();
  return run.code === 0 && commit !== '' ? commit : null;
}

export function codeGraphsOf(options: CodeGraphsOptions): CodeGraphs {
  const { root, program, git, env } = options;
  return {
    program,
    base: (plot) => baseOf(git, plot),
    head: (territory) => headOf(git, territory),
    built: (territory, commit) => builtGraph(root, territory, commit),
    build: (territory, commit, signal) =>
      buildGraph({
        root,
        territory,
        commit,
        program,
        git,
        env,
        timeout_ms: options.timeout_ms ?? GRAPH_TIMEOUT_MS,
        ...(signal === undefined ? {} : { signal }),
      }),
    envFor: (base, graphDir) => graphEnvOf(base, program.path, graphDir),
    ask: (graphDir, args, cwd) =>
      runProgram(graphArgv(program, args), {
        cwd,
        env: graphEnvOf(env, program.path, graphDir),
        timeout_ms: GRAPH_ASK_TIMEOUT_MS,
      }),
  };
}
