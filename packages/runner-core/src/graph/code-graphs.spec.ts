// The code graphs' port (PS-21): the base of a quest's plot from its record, the default branch's tip, a session's
// env and one question, against a fake graphify (build-graph.spec.ts) in folders whose names have spaces.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { fromPortable } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FAKE_GRAPHIFY } from '../__fixtures__/fake-graphify.ts';
import { RM_TEMP } from '../__fixtures__/temp.ts';
import {
  TEST_HOST,
  commitFile,
  git,
  gitRepo,
  minimalEnv,
  questId,
  territoryAt,
} from '../__fixtures__/git-repo.ts';
import { createPlotManager } from '../plot/plot-manager.ts';
import { gitOf } from '../plot/git.ts';
import { codeGraphsOf } from './code-graphs.ts';
import { GRAPHIFY_ENV, GRAPH_OUT_ENV, graphEnvOf } from './graph-env.ts';
import type { CodeGraphs } from './code-graphs.ts';

let root = '';
let repo = '';
let graphs: CodeGraphs;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria graphs port '));
  repo = await gitRepo(path.join(root, 'territory repo'));
  await commitFile(repo, 'src/a.ts', 'export const a = 1;\n');
  const fake = path.join(root, 'fake graphify.mjs');
  await writeFile(fake, FAKE_GRAPHIFY);
  const found = await gitOf(TEST_HOST);
  if (found === undefined) throw new Error('git not found');
  graphs = codeGraphsOf({
    root: path.join(root, 'the kingdom'),
    program: { path: process.execPath, version: '0.9.106', args: [fake] },
    git: found,
    env: minimalEnv(),
  });
});
afterAll(() => rm(root, RM_TEMP));

describe('codeGraphsOf', () => {
  it('reads the commit a quest branch forked from, which stays when the branch moves on', async () => {
    const plots = createPlotManager({ kingdom: path.join(root, 'the kingdom'), host: TEST_HOST });
    const prepared = await plots.prepare({ id: questId('gr4ph1') }, territoryAt(repo));
    if (!prepared.ok) throw new Error(prepared.error.detail);
    const plot = fromPortable(prepared.value.plot.path ?? '');
    const fork = git(repo, 'rev-parse', 'main');
    await commitFile(plot, 'src/b.ts', 'export const b = 2;\n');
    expect(await graphs.base(plot)).toBe(fork);
    expect(await graphs.base(path.join(root, 'no plot here'))).toBeNull();
  });

  it("reads the default branch's tip; none without git or for an unknown branch", async () => {
    const territory = territoryAt(repo);
    expect(await graphs.head(territory)).toBe(git(repo, 'rev-parse', 'main'));
    expect(await graphs.head({ ...territory, vcs: { type: 'git', default_branch: 'gone' } })).toBeNull();
    expect(await graphs.head({ ...territory, vcs: { type: 'none' } })).toBeNull();
  });

  it('builds, then answers from the graph its env names', async () => {
    const territory = territoryAt(repo);
    const commit = git(repo, 'rev-parse', 'main');
    expect(await graphs.built(territory.id, commit)).toBeUndefined();
    const build = await graphs.build(territory, commit);
    if (!build.ok) throw new Error(build.reason);
    expect(await graphs.built(territory.id, commit)).toBe(build.dir);
    const answer = await graphs.ask(build.dir, ['explain', 'a'], root);
    expect(answer.exit_code).toBe(0);
    expect(answer.stdout).toContain(path.join(build.dir, 'graph.json'));
    expect(answer.stdout).toContain('explain a');
  });
});

describe('graphEnvOf', () => {
  it("adds graphify's fixed names, the graph folder and graphify's folder first on PATH", () => {
    const program = path.join(root, 'tools dir', 'graphify.exe');
    const env = graphEnvOf({ PATH: 'C:/first', HOME: 'h' }, program, 'C:/graphs/x');
    expect(env).toMatchObject({ ...GRAPHIFY_ENV, [GRAPH_OUT_ENV]: 'C:/graphs/x', HOME: 'h' });
    expect(env.PATH).toBe(`${path.dirname(program)}${path.delimiter}C:/first`);
    expect(graphEnvOf({}, program, 'g').PATH).toBe(path.dirname(program));
  });
});
