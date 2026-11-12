// The code graphs the Steward builds outside the tick (PS-21, ADR 0029): a table of its own, by territory and commit,
// because Background keeps one piece of work per quest and a graph serves every quest on its commit. A build never
// holds a session: a quest whose graph is not built yet opens without it. One build per territory at a time (the
// source worktree is shared); the latest commit asked for meanwhile waits for it. A commit that failed is not tried
// again while this Steward runs, so a broken build costs one `graph.failed` line, not one per tick; a Steward that
// stops kills the build, and the next one builds again what it needs.
import { GRAPH_BUSY } from '@elvaria/runner-core';
import type { Territory, TerritoryId } from '@elvaria/domain';
import type { CodeGraphs, GraphBuild } from '@elvaria/runner-core';

import type { Logger } from './types.ts';

/** Writes a `graph.*` line; given by the tick that asked, as a check's lines are. */
export type GraphNote = (
  type: 'graph.built' | 'graph.failed',
  territory: TerritoryId,
  data: Readonly<Record<string, unknown>>,
) => Promise<void>;

export interface GraphBuilds {
  /**
   * The graph's folder when the graph of `territory` at `commit` is built; else undefined, and its build starts (or
   * waits behind the territory's running one) unless it failed already.
   */
  want(territory: Territory, commit: string, note: GraphNote): Promise<string | undefined>;
  /** Resolves once no build runs. */
  idle(): Promise<void>;
  /** Aborts the builds and waits for them to end (the Steward stops). */
  stop(): Promise<void>;
}

interface Running {
  readonly commit: string;
  readonly control: AbortController;
}

interface Wanted {
  readonly territory: Territory;
  readonly commit: string;
  readonly note: GraphNote;
}

interface State {
  readonly graphs: CodeGraphs;
  readonly log: Logger;
  readonly running: Map<TerritoryId, Running>;
  readonly waiting: Map<TerritoryId, Wanted>;
  readonly failed: Set<string>;
  readonly live: Set<Promise<void>>;
  stopped: boolean;
}

const keyOf = (territory: TerritoryId, commit: string): string => `${territory}@${commit}`;

/** What the build gave, as a line: a graph found built writes nothing. */
async function report(state: State, wanted: Wanted, result: GraphBuild): Promise<void> {
  const { territory, commit, note } = wanted;
  if (result.ok) {
    if (result.reused) return;
    const counts = {
      ...(result.nodes === null ? {} : { nodes: result.nodes }),
      ...(result.edges === null ? {} : { edges: result.edges }),
    };
    await note('graph.built', territory.id, { commit, ...counts, duration_ms: result.duration_ms });
    return;
  }
  // Another build holds the territory (`elvaria territory graph`): no failure, the next tick asks again.
  if (result.reason === GRAPH_BUSY) return;
  state.failed.add(keyOf(territory.id, commit));
  state.log.warn(`steward: ${territory.id}: no code graph at ${commit}: ${result.reason}`);
  await note('graph.failed', territory.id, { commit, reason: result.reason });
}

function start(state: State, wanted: Wanted): void {
  const { territory, commit } = wanted;
  const control = new AbortController();
  state.running.set(territory.id, { commit, control });
  const done = state.graphs
    .build(territory, commit, control.signal)
    .then(async (result) => {
      if (!control.signal.aborted) await report(state, wanted, result);
    })
    .catch((error: unknown) => {
      state.log.warn(
        `steward: ${territory.id}: its graph build stopped: ${error instanceof Error ? error.message : String(error)}`,
      );
    })
    .finally(() => {
      state.running.delete(territory.id);
      const next = state.waiting.get(territory.id);
      state.waiting.delete(territory.id);
      if (next !== undefined && !state.stopped) start(state, next);
    });
  state.live.add(done);
  void done.finally(() => state.live.delete(done));
}

export function createGraphBuilds(graphs: CodeGraphs, log: Logger): GraphBuilds {
  const state: State = {
    graphs,
    log,
    running: new Map(),
    waiting: new Map(),
    failed: new Set(),
    live: new Set(),
    stopped: false,
  };
  return {
    want: async (territory, commit, note) => {
      const built = await graphs.built(territory.id, commit);
      if (built !== undefined) return built;
      if (state.stopped || state.failed.has(keyOf(territory.id, commit))) return undefined;
      const running = state.running.get(territory.id);
      if (running === undefined) start(state, { territory, commit, note });
      else if (running.commit !== commit) state.waiting.set(territory.id, { territory, commit, note });
      return undefined;
    },
    idle: async () => {
      while (state.live.size > 0) await Promise.all(state.live);
    },
    stop: async () => {
      state.stopped = true;
      state.waiting.clear();
      for (const running of state.running.values()) running.control.abort();
      while (state.live.size > 0) await Promise.all(state.live);
    },
  };
}
