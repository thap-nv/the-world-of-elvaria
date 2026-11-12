// graphify in `elvaria doctor` and `elvaria territory graph` (PS-21): checked only when a territory has code_graph on
// or one is pinned; missing or unpinned is a warning, never an error; `--pin` writes kingdom.programs.graphify and a
// changed version is told. The build itself is runner-core's (graph/build-graph.spec.ts): here, the ways it cannot run.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  baseEnv,
  fakeTool,
  foundKingdom,
  git,
  gitRepo,
  isolatedPath,
  printed,
  run,
  tempDir,
  testIo,
} from '../../test/cli.ts';
import type { TempDir } from '../../test/cli.ts';

let dir: TempDir;
let kingdom = '';
let repo = '';
beforeEach(async () => {
  dir = await tempDir();
  kingdom = await foundKingdom(dir.root);
  repo = await gitRepo(path.join(dir.root, 'territory repo'));
  await writeFile(path.join(repo, 'a.ts'), 'export const a = 1;\n');
  git(repo, 'add', '--all');
  git(repo, 'commit', '-q', '-m', 'first');
  expect(await run(testIo(), 'territory', 'add', repo, '--id', 'web', '--kingdom', kingdom)).toBe(0);
});
afterEach(() => dir.remove());

async function graphOn(on = true): Promise<void> {
  const file = path.join(kingdom, 'territories', 'web', 'territory.json');
  const territory = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  await writeFile(file, `${JSON.stringify({ ...territory, code_graph: on }, null, 2)}\n`);
}

async function doctor(tools: string, ...flags: string[]): Promise<string> {
  const io = testIo({ env: baseEnv(await isolatedPath(tools)), home: dir.root });
  await run(io, 'doctor', ...flags, '--kingdom', kingdom, '--locale', 'en');
  return printed(io);
}

const pinnedGraphify = async () =>
  (
    JSON.parse(await readFile(path.join(kingdom, 'kingdom.json'), 'utf8')) as {
      programs?: { graphify?: unknown };
    }
  ).programs?.graphify;

describe('elvaria doctor: graphify (PS-21)', () => {
  it('says nothing of graphify while no territory has a code graph', async () => {
    expect(await doctor(path.join(dir.root, 'no tools'))).not.toContain('graphify');
  });

  it('warns when a territory has a code graph and graphify is missing, with how to install it', async () => {
    await graphOn();
    const out = await doctor(path.join(dir.root, 'no tools'));
    expect(out).toContain('! graphify not found: territories web run their quests without a code graph.');
    expect(out).toContain('uv tool install graphifyy');
  });

  it('finds graphify, pins it with --pin, then tells a changed version', async () => {
    await graphOn();
    const tools = path.join(dir.root, 'tool dir');
    await fakeTool(tools, 'graphify', 'graphify 0.9.106');
    expect(await doctor(tools)).toMatch(
      /✓ graphify 0\.9\.106 at .*\n! graphify is not pinned: run elvaria doctor --pin/,
    );
    expect(await doctor(tools, '--pin')).toContain(
      '✓ Pinned graphify 0.9.106 in kingdom.json (programs.graphify).',
    );
    expect(await pinnedGraphify()).toMatchObject({ version: '0.9.106' });
    expect(await doctor(tools)).not.toContain('not pinned');
    await fakeTool(tools, 'graphify', 'graphify 0.9.107');
    expect(await doctor(tools)).toContain('! graphify changed from 0.9.106 to 0.9.107');
  });
});

describe('elvaria territory graph (PS-21)', () => {
  const graph = async (...args: string[]) => {
    const io = testIo();
    const code = await run(io, 'territory', 'graph', ...args, '--kingdom', kingdom, '--locale', 'en');
    return { code, out: printed(io) };
  };

  it('names what is missing: the territory, or a pinned graphify', async () => {
    const unknown = await graph('nowhere');
    expect(unknown.code).toBe(1);
    expect(unknown.out).toContain('There is no territory nowhere');
    const unpinned = await graph('web');
    expect(unpinned.code).toBe(1);
    expect(unpinned.out).toContain('No graphify is pinned (or git is missing)');
  });
});
