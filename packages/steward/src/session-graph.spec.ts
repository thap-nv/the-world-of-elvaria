// A quest's code graph in its sessions (PS-21): on a territory with `code_graph` on and graphify pinned (the port),
// a session whose graph is built gets the graph commands in its tool policy, GRAPHIFY_OUT in its env and the block in
// its system part, the judge with its line; a graph still to build is asked for and the session opens without it;
// with the switch off, or no port, nothing changes and nothing is built.
import { GRAPH_COMMANDS, TerritorySchema } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { A, fakeGraphs } from './__fixtures__/graphs.ts';
import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { statusIs } from './__fixtures__/review.ts';
import type { FakeGraphs } from './__fixtures__/graphs.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';
import type { TerritoryId } from '@elvaria/domain';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** A quest worked by kael (claude, a knight) and judged by orin (gemini, a judge) on dc1-se-team. */
async function worked(graphs: FakeGraphs | undefined, codeGraph: boolean) {
  current = await bench({
    cast: [
      { id: 'kael', cls: 'knight' },
      { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-low' },
    ],
  });
  const read = await current.store.territories.read('dc1-se-team' as TerritoryId);
  if (!read.ok) throw new Error('fixture: no territory dc1-se-team');
  const territory = { ...read.value, vcs: { type: 'git', default_branch: 'main' }, code_graph: codeGraph };
  await current.store.territories.write(TerritorySchema.parse(territory));
  running = current.steward(graphs === undefined ? {} : { graphs });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  await current.command('create_quest', questPayload('Graph words'));
  await tickUntil(running, current.clock, statusIs(current, 'Graph words', 'done'));
  const requestOf = (role: string) => {
    const found = current?.requests.find((req) => req.role === role);
    if (found === undefined) throw new Error(`no ${role} request`);
    return found;
  };
  return { assignee: requestOf('assignee'), verifier: requestOf('verifier') };
}

describe('a quest whose code graph is built (PS-21)', () => {
  it('gives the assignee and the judge the graph commands, the graph in their env and the block', async () => {
    const graphs = fakeGraphs(A, [A]);
    const { assignee, verifier } = await worked(graphs, true);
    for (const request of [assignee, verifier]) {
      expect(request.permissions.graph_commands).toEqual([...GRAPH_COMMANDS]);
      expect(request.env.GRAPHIFY_OUT).toBe(`C:/graphs/${A}`);
      expect(request.prompt.system).toContain(
        `## Code graph\n\nA graph of this territory's code at commit \`${A.slice(0, 12)}\``,
      );
    }
    expect(verifier.prompt.system).toContain("As a judge, ask `graphify affected '<name>'`");
    expect(assignee.prompt.system).not.toContain('As a judge');
    expect(graphs.started).toEqual([]);
  });
});

describe('a quest whose code graph is not there (PS-21)', () => {
  it('opens its sessions without it while the build runs', async () => {
    const graphs = fakeGraphs(A);
    const { assignee } = await worked(graphs, true);
    expect(graphs.started).toEqual([A]);
    expect(assignee.permissions).not.toHaveProperty('graph_commands');
    expect(assignee.env).not.toHaveProperty('GRAPHIFY_OUT');
    expect(assignee.prompt.system).not.toContain('graphify');
  });

  it('changes nothing with the switch off, and builds nothing', async () => {
    const graphs = fakeGraphs(A, [A]);
    const { assignee, verifier } = await worked(graphs, false);
    expect(graphs.started).toEqual([]);
    for (const request of [assignee, verifier]) {
      expect(request.permissions).not.toHaveProperty('graph_commands');
      expect(request.env).not.toHaveProperty('GRAPHIFY_OUT');
      expect(request.prompt.system).not.toContain('graphify');
    }
  });

  it('changes nothing without graphify, whatever the switch says', async () => {
    const { assignee } = await worked(undefined, true);
    expect(assignee.permissions).not.toHaveProperty('graph_commands');
    expect(assignee.prompt.system).not.toContain('graphify');
  });
});
