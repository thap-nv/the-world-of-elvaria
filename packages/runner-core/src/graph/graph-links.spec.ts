import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { graphLinksOf, readGraphLinks } from './graph-links.ts';

/** graphify's node-link data, as `graph.json` holds it (0.9.106): file nodes, symbol nodes and their links. */
const GRAPH = {
  directed: true,
  nodes: [
    { id: 'say_ts', label: 'say.ts', source_file: 'apps/cli/src/say/say.ts' },
    { id: 'say_fn', label: 'say()', source_file: 'apps/cli/src/say/say.ts', source_location: 'L52' },
    { id: 'commands_ts', label: 'commands.ts', source_file: 'packages\\chancellor\\src\\commands.ts' },
    { id: 'draft_fn', label: 'draftCommands()', source_file: './packages/chancellor/src/commands.ts' },
    { id: 7, label: 'screen()', source_file: 'packages/chancellor/src/screen.ts' },
    { id: 'zod', label: 'zod', source_file: '' },
  ],
  links: [
    { source: 'say_ts', target: 'draft_fn', relation: 'imports' },
    { source: 'say_fn', target: 'draft_fn', relation: 'calls' },
    { source: 'say_ts', target: 'say_fn', relation: 'contains' },
    { source: 'commands_ts', target: 'zod', relation: 'imports_from' },
    { source: 'draft_fn', target: 7, relation: 'calls' },
    { source: 'draft_fn', target: 'draft_fn', relation: 'calls' },
    { source: 'unknown', target: 7, relation: 'calls', source_file: 'apps/cli/src/run/triage.ts' },
    { source: 'say_fn', target: 'missing', relation: 'calls' },
    { source: 'say_fn', target: 'draft_fn' },
    'not a link',
  ],
};

describe('graphLinksOf (PS-21b)', () => {
  it('turns links between nodes into distinct uses between files, in the graph’s order', () => {
    expect(graphLinksOf(GRAPH)).toEqual([
      { from: 'apps/cli/src/say/say.ts', to: 'packages/chancellor/src/commands.ts' },
      { from: 'packages/chancellor/src/commands.ts', to: 'packages/chancellor/src/screen.ts' },
      { from: 'apps/cli/src/run/triage.ts', to: 'packages/chancellor/src/screen.ts' },
    ]);
  });

  it('reads `edges` when a graph has no `links`, and nothing from a graph of another shape', () => {
    expect(graphLinksOf({ nodes: GRAPH.nodes, edges: GRAPH.links.slice(0, 1) })).toHaveLength(1);
    expect(graphLinksOf([])).toEqual([]);
    expect(graphLinksOf({ nodes: 'none', links: GRAPH.links })).toEqual([]);
    expect(graphLinksOf(null)).toEqual([]);
  });
});

describe('readGraphLinks', () => {
  const made: string[] = [];
  afterAll(async () => {
    await Promise.all(made.map((dir) => rm(dir, RM_TEMP)));
  });
  const folder = async (): Promise<string> => {
    const dir = await mkdtemp(path.join(tmpdir(), 'elvaria graph links '));
    made.push(dir);
    return dir;
  };

  it("reads the graph's file, and says nothing of a graph missing or broken", async () => {
    const dir = await folder();
    await writeFile(path.join(dir, 'graph.json'), JSON.stringify(GRAPH));
    expect(await readGraphLinks(dir)).toHaveLength(3);
    const broken = await folder();
    await writeFile(path.join(broken, 'graph.json'), '{"nodes": [');
    expect(await readGraphLinks(broken)).toBeUndefined();
    const empty = path.join(await folder(), 'none yet');
    await mkdir(empty);
    expect(await readGraphLinks(empty)).toBeUndefined();
  });
});
