// A territory's code graph (PS-21): built at a commit from a detached worktree kept in the kingdom, never in the
// territory's checkout, with graphify's fixed env; found again, seeded from the newest, pruned, refused while another
// build holds the territory. graphify is a fake here (a node script): what it does is graphify's, what reaches it is
// Elvaria's.
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { acquireLock, inKingdom, kingdomLayout } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { TEST_HOST, commitFile, git, gitRepo, minimalEnv } from '../__fixtures__/git-repo.ts';
import { gitOf } from '../plot/git.ts';
import { FAKE_GRAPHIFY } from '../__fixtures__/fake-graphify.ts';
import { GRAPH_BUSY, GRAPH_KEEP, buildGraph, builtGraph } from './build-graph.ts';
import type { Git } from '../plot/git.ts';
import type { GraphBuildOptions, GraphProgram } from './build-graph.ts';

/** What the fake graphify writes as its graph. */
interface FakeGraph {
  readonly files: readonly string[];
  readonly seeded: boolean;
  readonly args: readonly string[];
}

let root = '';
let kingdom = '';
let repo = '';
let program: GraphProgram = { path: process.execPath, version: '0.9.106' };
let runGit: Git;
const territory = () => ({ id: 'dc1' as GraphBuildOptions['territory']['id'], path: repo });
const options = (commit: string): GraphBuildOptions => ({
  root: kingdom,
  territory: territory(),
  commit,
  program,
  git: runGit,
  // A key in the host's env must not reach graphify unless the base env carries it, and the base is minimal.
  env: { ...minimalEnv(), PATH: process.env.PATH ?? '' },
});
const head = (): string => git(repo, 'rev-parse', 'HEAD');

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria code graph '));
  kingdom = path.join(root, 'the kingdom');
  repo = await gitRepo(path.join(root, 'territory repo'));
  const fake = path.join(root, 'fake graphify.mjs');
  await writeFile(fake, FAKE_GRAPHIFY);
  program = { path: process.execPath, version: '0.9.106', args: [fake] };
  const found = await gitOf(TEST_HOST);
  if (found === undefined) throw new Error('git not found');
  runGit = found;
});
afterAll(() => rm(root, RM_TEMP));

describe('buildGraph', () => {
  it('builds the graph of a commit in the kingdom, from its own worktree, with graphify fixed env', async () => {
    await commitFile(repo, 'a.ts', 'export const a = 1;\n');
    const commit = head();
    const build = await buildGraph(options(commit));
    expect(build).toMatchObject({ ok: true, commit, nodes: 3, edges: 6, reused: false });
    if (!build.ok) return;
    expect(build.dir).toBe(inKingdom(kingdom, kingdomLayout.graph('dc1' as never, commit)));
    const graph = JSON.parse(await readFile(path.join(build.dir, 'graph.json'), 'utf8')) as FakeGraph;
    expect(graph.files).toContain('a.ts');
    expect(graph.seeded).toBe(false);
    expect(graph.args).toEqual([
      inKingdom(kingdom, kingdomLayout.graphSource('dc1' as never)),
      '--no-cluster',
    ]);
    // Nothing reaches the territory's checkout: no graph folder, no file, ignored or not.
    expect(git(repo, 'status', '--porcelain', '--ignored')).toBe('');
    const env = JSON.parse(await readFile(path.join(build.dir, 'env.json'), 'utf8')) as Record<
      string,
      string
    >;
    expect(env).toMatchObject({
      GRAPHIFY_BACKEND: 'none',
      GRAPHIFY_QUERY_LOG_DISABLE: '1',
      GRAPHIFY_NO_AUTO_REFRESH: '1',
      PYTHONHASHSEED: '0',
      PYTHONDONTWRITEBYTECODE: '1',
    });
    expect(Object.keys(env).some((name) => /API_KEY|TOKEN/i.test(name))).toBe(false);
  });

  it('finds a built graph without running graphify again', async () => {
    const commit = head();
    const dir = await builtGraph(kingdom, 'dc1' as never, commit);
    expect(dir).toBeDefined();
    expect(await buildGraph(options(commit))).toMatchObject({ ok: true, reused: true, duration_ms: 0 });
  });

  it('starts from a copy of the newest graph and moves the worktree to the new commit', async () => {
    await commitFile(repo, 'b.ts', 'export const b = 2;\n');
    const build = await buildGraph(options(head()));
    expect(build.ok).toBe(true);
    if (!build.ok) return;
    const graph = JSON.parse(await readFile(path.join(build.dir, 'graph.json'), 'utf8')) as FakeGraph;
    expect(graph.seeded).toBe(true);
    expect(graph.files).toContain('b.ts');
  });

  it(`keeps the ${GRAPH_KEEP} newest graphs of a territory`, async () => {
    for (const name of ['c.ts', 'd.ts']) {
      await commitFile(repo, name, `export const x = '${name}';\n`);
      expect((await buildGraph(options(head()))).ok).toBe(true);
    }
    const folder = inKingdom(kingdom, kingdomLayout.graphs('dc1' as never));
    const commits = (await readdir(folder)).filter((name) => /^[0-9a-f]{40}$/.test(name));
    expect(commits).toHaveLength(GRAPH_KEEP);
    expect(commits).toContain(head());
  });

  it('says why a build failed and leaves no half-built graph', async () => {
    await commitFile(repo, 'fail.txt', 'x\n');
    const build = await buildGraph(options(head()));
    expect(build.ok ? '' : build.reason).toContain('boom: no grammar');
    const folder = inKingdom(kingdom, kingdomLayout.graphs('dc1' as never));
    expect((await readdir(folder)).some((name) => name.endsWith('.building'))).toBe(false);
    expect(existsSync(path.join(folder, head()))).toBe(false);
  });

  it('refuses a commit that is not a full id, and waits for no other build of the territory', async () => {
    const refused = await buildGraph(options('HEAD'));
    expect(refused.ok ? '' : refused.reason).toContain('full');
    git(repo, 'rm', '-q', 'fail.txt');
    git(repo, 'commit', '-q', '-m', 'drop fail');
    const held = await acquireLock(inKingdom(kingdom, kingdomLayout.graphLock('dc1' as never)), {
      wait: false,
    });
    if (!held.ok) throw new Error('lock not taken');
    try {
      expect(await buildGraph(options(head()))).toEqual({ ok: false, commit: head(), reason: GRAPH_BUSY });
    } finally {
      await held.value.release();
    }
  });

  it('makes the worktree again when it broke', async () => {
    const source = inKingdom(kingdom, kingdomLayout.graphSource('dc1' as never));
    await rm(path.join(source, '.git'), RM_TEMP);
    await commitFile(repo, 'e.ts', 'export const e = 5;\n');
    expect((await buildGraph(options(head()))).ok).toBe(true);
    expect(existsSync(path.join(source, 'e.ts'))).toBe(true);
  });
});
