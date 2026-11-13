// `elvaria say` hands the Chancellor what the code says of the owner's words (PS-21b), 0 mana: a fake Chancellor
// hears the files' sizes and the code graph's answer in its system part; graphify never runs, a fake port answers.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { TerritorySchema, TribeIdSchema } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { createFakeRunner } from '@elvaria/runner-core';
import type { AgentRunner, CodeGraphs } from '@elvaria/runner-core';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, git, gitRepo, run, tempDir, testIo } from '../../test/cli.ts';
import { sayCommand } from './say.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

const REPLY = path.join(
  import.meta.dirname,
  ...['..', '..', '..', '..', 'packages', 'chancellor', 'src', '__fixtures__', 'structured-output'],
  'link-check.json',
);
const CLAUDE = TribeIdSchema.parse('claude');
const TIP = 'b'.repeat(40);
const SOURCE = 'export function draftQuests() {\n  return [];\n}\n';
const ANSWER = 'NODE draftQuests() [src=packages/chancellor/draft-quests.ts loc=L1 community=1]';
const WORDS = 'Đổi `draftQuests` trong packages/chancellor/draft-quests.ts';

let dir: TempDir;
let kingdom: string;
let repo: string;

beforeEach(async () => {
  dir = await tempDir();
  kingdom = await foundKingdom(dir.root);
  expect(
    await run(testIo(), 'character', 'add', 'aldric', '--class', 'chancellor', '--kingdom', kingdom),
  ).toBe(0);
  repo = await gitRepo(path.join(dir.root, 'elvaria repo'));
  await mkdir(path.join(repo, 'packages', 'chancellor'), { recursive: true });
  await writeFile(path.join(repo, 'packages', 'chancellor', 'draft-quests.ts'), SOURCE);
  git(repo, 'add', '--all');
  // The fixture reply drafts for dc1-se-team: a territory with no folder, whose code says nothing.
  const elsewhere = { id: 'dc1-se-team', path: path.join(dir.root, 'dc1-se-team').replaceAll('\\', '/') };
  await openKingdom(kingdom).territories.write(territoryOf(elsewhere));
});
afterEach(() => dir.remove());

const territoryOf = (fields: Readonly<Record<string, unknown>>) =>
  TerritorySchema.parse({
    version: 1,
    kind: 'code',
    name: String(fields.id),
    vcs: { type: 'git', default_branch: 'main' },
    commands: {},
    checks: [],
    laws: { forbidden_paths: [], forbidden_commands: [] },
    secrets_allowed: [],
    ...fields,
  });

const territory = (codeGraph: boolean) =>
  territoryOf({ id: 'elvaria', path: repo.replaceAll('\\', '/'), code_graph: codeGraph });

const GRAPHS: CodeGraphs = {
  program: { path: 'graphify', version: '0.9.106' },
  base: () => Promise.resolve(null),
  head: () => Promise.resolve(TIP),
  built: () => Promise.resolve(path.join(dir.root, 'graphs', TIP)),
  build: () => Promise.reject(new Error('say builds no graph')),
  envFor: (env) => ({ ...env }),
  ask: () => Promise.resolve({ exit_code: 0, timed_out: false, duration_ms: 1, stdout: ANSWER, stderr: '' }),
};

/** A fake Chancellor that replies with a fixture and keeps the system part of each prompt it hears. */
async function listening(heard: string[]): Promise<AgentRunner> {
  const structured: unknown = JSON.parse(await readFile(REPLY, 'utf8'));
  const fake = createFakeRunner();
  return {
    ...fake,
    spawn: async (req) => {
      heard.push(req.prompt.system);
      const session = await fake.spawn(req);
      return { ...session, wait: async () => ({ ...(await session.wait()), structured }) };
    },
  };
}

describe('elvaria say: the code in the Chancellor’s prompt (PS-21b)', () => {
  it('hands it the size of the files the words name and the code graph’s answer; with the switch off, the sizes only', async () => {
    await openKingdom(kingdom).territories.write(territory(true));
    const heard: string[] = [];
    const chancellor = await listening(heard);
    const sayWith = (io: TestIo) =>
      sayCommand({
        runnersOf: () => ({ [CLAUDE]: chancellor }),
        graphsOf: () => Promise.resolve(GRAPHS),
      }).run(
        { values: { kingdom }, positionals: [WORDS] },
        { io, locale: 'en', localeFromFlag: true, t: translator('en') },
      );
    const io = testIo();
    expect(await sayWith(io)).toBe(0);
    expect(io.printed.out.slice(0, 2)).toEqual([
      'The Chancellor gets the size of the files your words name: 1 in all.',
      'The Chancellor gets what the code graph of elvaria says of your words.',
    ]);
    expect(heard[0]).toContain(
      `- \`packages/chancellor/draft-quests.ts\`: 1 file, ${SOURCE.length} B in all`,
    );
    expect(heard[0]).toContain(
      `Asked: \`graphify query 'draftQuests packages/chancellor/draft-quests.ts'\`\n\n- \`packages/chancellor/draft-quests.ts\` (${SOURCE.length} B, 3 lines): \`draftQuests()\``,
    );
    await openKingdom(kingdom).territories.write(territory(false));
    const off = testIo();
    expect(await sayWith(off)).toBe(0);
    expect(heard[1]).toContain("# The files the owner's words name");
    expect(heard[1]).not.toContain('# What the code graph answers');
    expect(off.printed.out).not.toContain(
      'The Chancellor gets what the code graph of elvaria says of your words.',
    );
  });

  it('hands it nothing of the code when the words name none, and asks no graph', async () => {
    await openKingdom(kingdom).territories.write(territory(true));
    const heard: string[] = [];
    const chancellor = await listening(heard);
    const asked: string[][] = [];
    const graphs: CodeGraphs = {
      ...GRAPHS,
      ask: (graphDir, args) => {
        asked.push([...args]);
        return GRAPHS.ask(graphDir, args, repo);
      },
    };
    const io = testIo();
    const code = await sayCommand({
      runnersOf: () => ({ [CLAUDE]: chancellor }),
      graphsOf: () => Promise.resolve(graphs),
    }).run(
      { values: { kingdom }, positionals: ['Viết lại phần cài đặt cho rõ.'] },
      { io, locale: 'en', localeFromFlag: true, t: translator('en') },
    );
    expect(code).toBe(0);
    expect(asked).toEqual([]);
    expect(heard[0]).not.toContain('# The files the owner');
    expect(heard[0]).not.toContain('# What the code graph answers');
  });
});
