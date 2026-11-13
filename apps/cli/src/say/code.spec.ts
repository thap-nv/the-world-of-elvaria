// What `elvaria say` reads of the code before the Chancellor drafts (PS-21b), 0 mana: the size of the files the owner's
// words name, from a git territory's working tree whatever `code_graph` says, and where the switch is on and the graph
// is built at the tip, graphify's answer and the impact of the named files. graphify never runs here: a fake port
// answers, and the graph's links are a graph.json in a temp folder.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { TerritorySchema } from '@elvaria/domain';
import { gitOf } from '@elvaria/runner-core';
import type { Territory } from '@elvaria/domain';
import type { CodeGraphs, Git, ProgramRun } from '@elvaria/runner-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { git, gitRepo, tempDir, testIo } from '../../test/cli.ts';
import { processHostOf } from '../run/plots.ts';
import { codeOf } from './code.ts';
import type { TempDir } from '../../test/cli.ts';

const TIP = '43566818d835f9acb3c24e8b2acffbfe90133284';
const ORDERS = 'export const LIMIT = 5;\nexport function orders() {\n  return LIMIT;\n}\n';
const BIG = '// a line of the big file\n'.repeat(400);
const README = '# dc1\n\nThe orders app.\n';
const PAGE = 'export const Page = () => null;\n';
const FILES: Readonly<Record<string, string>> = {
  'apps/api/src/orders.ts': ORDERS,
  'apps/api/src/big.ts': BIG,
  'apps/api/src/no-end.ts': 'export {}',
  'apps/web/src/orders/page.tsx': PAGE,
  'apps/web/src/lib/client.ts': 'export const client = {};\n',
  'scripts/seed.ts': 'seed();\n',
  'README.md': README,
};

/** graphify's node-link data: three files outside `apps/api` use code in it. */
const GRAPH = {
  nodes: [
    { id: 'orders', source_file: 'apps/api/src/orders.ts' },
    { id: 'big', source_file: 'apps/api/src/big.ts' },
    { id: 'page', source_file: 'apps/web/src/orders/page.tsx' },
    { id: 'client', source_file: 'apps/web/src/lib/client.ts' },
    { id: 'seed', source_file: 'scripts/seed.ts' },
  ],
  links: [
    { source: 'page', target: 'orders', relation: 'calls' },
    { source: 'client', target: 'orders', relation: 'imports' },
    { source: 'seed', target: 'big', relation: 'imports_from' },
    { source: 'big', target: 'orders', relation: 'calls' },
  ],
};

const ANSWER = [
  'NODE orders() [src=apps/api/src/orders.ts loc=L2 community=1]',
  'NODE LIMIT [src=apps/api/src/orders.ts loc=L1 community=1]',
  'NODE Page() [src=apps/web/src/orders/page.tsx loc=L1 community=2]',
  'NODE gone() [src=apps/old/gone.ts loc=L1 community=2]',
  'EDGE Page() --calls [EXTRACTED]--> orders()',
].join('\n');

const ran = (stdout: string, code = 0): ProgramRun => ({
  exit_code: code,
  timed_out: false,
  duration_ms: 1,
  stdout,
  stderr: '',
});

interface Fake extends CodeGraphs {
  readonly asked: (readonly string[])[];
}

/** A pinned graphify whose tip graph is built in `dir` (undefined: not built yet), answering `answer`. */
function fakeGraphs(dir: string | undefined, answer = ANSWER, code = 0): Fake {
  const asked: (readonly string[])[] = [];
  return {
    asked,
    program: { path: 'graphify', version: '0.9.106' },
    base: () => Promise.resolve(null),
    head: (territory) => Promise.resolve(territory.vcs.default_branch === 'none' ? null : TIP),
    built: () => Promise.resolve(dir),
    build: () => Promise.reject(new Error('say builds no graph')),
    envFor: (env) => ({ ...env }),
    ask: (_dir, args) => {
      asked.push(args);
      return Promise.resolve(ran(answer, code));
    },
  };
}

let dir: TempDir;
let repo: string;
let graphDir: string;
let gitRun: Git | undefined;

beforeEach(async () => {
  dir = await tempDir();
  repo = await gitRepo(path.join(dir.root, 'dc1 repo'));
  for (const [file, text] of Object.entries(FILES)) {
    await mkdir(path.dirname(path.join(repo, file)), { recursive: true });
    await writeFile(path.join(repo, file), text);
  }
  await writeFile(path.join(repo, 'untracked.ts'), 'nobody tracks me\n');
  git(repo, 'add', '--', ...Object.keys(FILES));
  graphDir = path.join(dir.root, 'graphs', TIP);
  await mkdir(graphDir, { recursive: true });
  await writeFile(path.join(graphDir, 'graph.json'), JSON.stringify(GRAPH));
  gitRun = await gitOf(processHostOf(testIo()));
});
afterEach(() => dir.remove());

const territoryOf = (fields: Record<string, unknown> = {}): Territory =>
  TerritorySchema.parse({
    version: 1,
    id: 'dc1-se-team',
    name: 'dc1',
    path: repo.replaceAll('\\', '/'),
    kind: 'code',
    vcs: { type: 'git', default_branch: 'main' },
    commands: {},
    checks: [],
    laws: { forbidden_paths: [], forbidden_commands: [] },
    secrets_allowed: [],
    ...fields,
  });

const read = (words: string, territory: Territory, graphs?: CodeGraphs) =>
  codeOf([territory], words, { git: gitRun, graphs, platform: process.platform });

describe('codeOf: the files the words name (PS-21b)', () => {
  it('reads their count, size and lines from the working tree, with the switch off', async () => {
    const graphs = fakeGraphs(graphDir);
    const [entry, ...rest] = await read(
      'Sửa `apps/api/**` và README.md, đọc no-end.ts',
      territoryOf(),
      graphs,
    );
    expect(rest).toEqual([]);
    expect(entry?.graph).toBeUndefined();
    expect(graphs.asked).toEqual([]);
    expect(entry?.named).toEqual([
      {
        words: 'apps/api/**',
        files: 3,
        bytes: BIG.length + ORDERS.length + 9,
        largest: [
          { path: 'apps/api/src/big.ts', bytes: BIG.length, lines: 400 },
          { path: 'apps/api/src/orders.ts', bytes: ORDERS.length, lines: 4 },
          { path: 'apps/api/src/no-end.ts', bytes: 9, lines: 1 },
        ],
      },
      {
        words: 'README.md',
        files: 1,
        bytes: README.length,
        largest: [{ path: 'README.md', bytes: README.length, lines: 3 }],
      },
      {
        words: 'no-end.ts',
        files: 1,
        bytes: 9,
        largest: [{ path: 'apps/api/src/no-end.ts', bytes: 9, lines: 1 }],
      },
    ]);
  });

  it('names a folder by its files, and nothing for paths the territory does not hold', async () => {
    const [entry] = await read('xem apps/web', territoryOf());
    expect(entry?.named.map(({ words, files }) => [words, files])).toEqual([['apps/web', 2]]);
    expect(await read('sửa docs/missing.md và untracked.ts', territoryOf())).toEqual([]);
    expect(await read('Viết lại phần cài đặt cho rõ.', territoryOf())).toEqual([]);
  });

  it('reads nothing of a territory without git, or on a machine without git', async () => {
    expect(await read('README.md', territoryOf({ vcs: { type: 'none' } }))).toEqual([]);
    expect(
      await codeOf([territoryOf()], 'README.md', {
        git: undefined,
        graphs: undefined,
        platform: process.platform,
      }),
    ).toEqual([]);
    const gone = territoryOf({ path: path.join(dir.root, 'gone').replaceAll('\\', '/') });
    expect(await read('README.md', gone)).toEqual([]);
  });
});

describe('codeOf: the code graph (PS-21b)', () => {
  const graphed = (fields: Record<string, unknown> = {}) => territoryOf({ code_graph: true, ...fields });

  it("asks it with the code words, sizes the files it names, and counts the named files' impact", async () => {
    const graphs = fakeGraphs(graphDir);
    const [entry] = await read('Đổi `orders` trong apps/api/src/orders.ts', graphed(), graphs);
    expect(graphs.asked).toEqual([['query', 'orders apps/api/src/orders.ts']]);
    expect(entry?.graph).toEqual({
      commit: TIP,
      question: 'orders apps/api/src/orders.ts',
      files: [
        {
          path: 'apps/api/src/orders.ts',
          names: ['orders()', 'LIMIT'],
          size: { path: 'apps/api/src/orders.ts', bytes: ORDERS.length, lines: 4 },
        },
        {
          path: 'apps/web/src/orders/page.tsx',
          names: ['Page()'],
          size: { path: 'apps/web/src/orders/page.tsx', bytes: PAGE.length, lines: 1 },
        },
        { path: 'apps/old/gone.ts', names: ['gone()'] },
      ],
      impact: ['apps/api/src/big.ts', 'apps/web/src/lib/client.ts', 'apps/web/src/orders/page.tsx'],
    });
  });

  it('has three files outside an area use it: an impact of 3', async () => {
    const [entry] = await read('Đổi apps/api/**', graphed(), fakeGraphs(graphDir, ''));
    expect(entry?.graph?.impact).toEqual([
      'apps/web/src/lib/client.ts',
      'apps/web/src/orders/page.tsx',
      'scripts/seed.ts',
    ]);
    expect(entry?.graph?.files).toEqual([]);
  });

  it('gives no graph when none is built, the answer and the area are empty, or the query fails', async () => {
    expect(
      (await read('Đổi `orders` trong README.md', graphed(), fakeGraphs(undefined)))[0]?.graph,
    ).toBeUndefined();
    expect(await read('Đổi `nothingHere`', graphed(), fakeGraphs(graphDir, 'No node matches.'))).toEqual([]);
    expect(await read('Đổi `orders`', graphed(), fakeGraphs(graphDir, ANSWER, 4))).toEqual([]);
    const tipless = graphed({ vcs: { type: 'git', default_branch: 'none' } });
    expect(await read('Đổi `orders`', tipless, fakeGraphs(graphDir))).toEqual([]);
    const silent = fakeGraphs(graphDir);
    expect(await read('Viết lại phần cài đặt.', graphed(), silent)).toEqual([]);
    expect(silent.asked).toEqual([]);
  });

  it('keeps the named files when the graph cannot be read for their impact', async () => {
    const [entry] = await read('README.md', graphed(), fakeGraphs(path.join(dir.root, 'no graph'), ''));
    expect(entry?.named).toHaveLength(1);
    expect(entry?.graph).toBeUndefined();
  });
});
