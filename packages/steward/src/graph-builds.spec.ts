// The Steward's table of code graph builds (PS-21): one build per territory at a time, the latest commit asked for
// meanwhile next, a failure written once and not tried again, another build's lock no failure, and stop() kills
// what runs. graphify is behind a fake port here.
import { describe, expect, it } from 'vitest';

import { GRAPH_BUSY } from '@elvaria/runner-core';
import { TerritorySchema } from '@elvaria/domain';

import { A, fakeGraphs } from './__fixtures__/graphs.ts';
import { createGraphBuilds } from './graph-builds.ts';
import type { GraphNote } from './graph-builds.ts';

const TERRITORY = TerritorySchema.parse({
  version: 1,
  id: 'dc1',
  name: 'DC1',
  path: 'C:/dc1',
  kind: 'code',
  vcs: { type: 'git', default_branch: 'main' },
});
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);

function recorder(): { note: GraphNote; lines: unknown[][] } {
  const lines: unknown[][] = [];
  return {
    lines,
    note: (type, territory, data) => {
      lines.push([type, territory, data]);
      return Promise.resolve();
    },
  };
}

describe('createGraphBuilds', () => {
  it('builds once, writes graph.built, then hands the folder', async () => {
    const port = fakeGraphs();
    const builds = createGraphBuilds(port, { warn: () => undefined });
    const { note, lines } = recorder();
    expect(await builds.want(TERRITORY, A, note)).toBeUndefined();
    expect(await builds.want(TERRITORY, A, note)).toBeUndefined();
    expect(port.started).toEqual([A]);
    port.finish(A);
    await builds.idle();
    expect(lines).toEqual([['graph.built', 'dc1', { commit: A, nodes: 3, duration_ms: 7 }]]);
    expect(await builds.want(TERRITORY, A, note)).toBe(`C:/graphs/${A}`);
  });

  it('runs the latest commit asked for after the running build, one at a time', async () => {
    const port = fakeGraphs();
    const builds = createGraphBuilds(port, { warn: () => undefined });
    const { note } = recorder();
    await builds.want(TERRITORY, A, note);
    await builds.want(TERRITORY, B, note);
    await builds.want(TERRITORY, C, note);
    expect(port.started).toEqual([A]);
    port.finish(A);
    await new Promise((resolve) => setImmediate(resolve));
    expect(port.started).toEqual([A, C]);
    port.finish(C);
    await builds.idle();
  });

  it('writes a failure once and does not try that commit again; a busy territory is no failure', async () => {
    const port = fakeGraphs();
    const warnings: string[] = [];
    const builds = createGraphBuilds(port, { warn: (line) => warnings.push(line) });
    const { note, lines } = recorder();
    await builds.want(TERRITORY, A, note);
    port.finish(A, { ok: false, reason: 'graphify update failed (exit 1): boom' });
    await builds.idle();
    await builds.want(TERRITORY, A, note);
    expect(port.started).toEqual([A]);
    expect(lines).toEqual([
      ['graph.failed', 'dc1', { commit: A, reason: 'graphify update failed (exit 1): boom' }],
    ]);
    expect(warnings[0]).toContain('no code graph at');
    await builds.want(TERRITORY, B, note);
    port.finish(B, { ok: false, reason: GRAPH_BUSY });
    await builds.idle();
    await builds.want(TERRITORY, B, note);
    expect(port.started).toEqual([A, B, B]);
    expect(lines).toHaveLength(1);
    port.finish(B, { reused: true });
    await builds.idle();
    expect(lines).toHaveLength(1);
  });

  it('kills the running build when the Steward stops, and starts none after', async () => {
    const port = fakeGraphs();
    const builds = createGraphBuilds(port, { warn: () => undefined });
    const { note, lines } = recorder();
    await builds.want(TERRITORY, A, note);
    await builds.want(TERRITORY, B, note);
    await builds.stop();
    expect(port.started).toEqual([A]);
    expect(lines).toEqual([]);
    expect(await builds.want(TERRITORY, C, note)).toBeUndefined();
    expect(port.started).toEqual([A]);
  });
});
