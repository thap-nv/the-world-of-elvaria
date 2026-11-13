// A fake port of the code graphs (PS-21): graphify never runs; a spec ends each build when it says, and a commit
// given as prebuilt is there from the start.
import type { CodeGraphs, GraphBuild } from '@elvaria/runner-core';

/** The commit the fake says every plot forked from, and the default branch's tip. */
export const A = 'a'.repeat(40);

export interface FakeGraphs extends CodeGraphs {
  readonly started: string[];
  /** Ends the build of `commit` with `result`. */
  finish(commit: string, result?: Partial<GraphBuild>): void;
}

/** `folder` holds the graphs: a spec that reads one (PS-21b) writes `<folder>/<commit>/graph.json` itself. */
export function fakeGraphs(base = A, prebuilt: readonly string[] = [], folder = 'C:/graphs'): FakeGraphs {
  const built = new Set<string>(prebuilt);
  const started: string[] = [];
  const pending = new Map<string, (result: GraphBuild) => void>();
  return {
    program: { path: 'graphify', version: '0.9.106' },
    started,
    base: () => Promise.resolve(base),
    head: () => Promise.resolve(base),
    built: (_territory, commit) => Promise.resolve(built.has(commit) ? `${folder}/${commit}` : undefined),
    build: (_territory, commit, signal) => {
      started.push(commit);
      return new Promise((resolve) => {
        pending.set(commit, resolve);
        signal?.addEventListener('abort', () => {
          resolve({ ok: false, commit, reason: 'aborted' });
        });
      });
    },
    finish: (commit, result = {}) => {
      const done: GraphBuild = {
        ok: true,
        dir: `${folder}/${commit}`,
        commit,
        nodes: 3,
        edges: null,
        duration_ms: 7,
        reused: false,
        ...result,
      } as GraphBuild;
      if (done.ok) built.add(commit);
      pending.get(commit)?.(done);
    },
    envFor: (env, dir) => ({ ...env, GRAPHIFY_OUT: dir }),
    ask: () => Promise.reject(new Error('not asked here')),
  };
}
