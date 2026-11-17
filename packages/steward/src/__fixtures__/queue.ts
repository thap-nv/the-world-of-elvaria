// What the merge queue's specs share (PS-09): the forge bench on a territory with a generated index under `docs/gen/`
// (regenerate) that `gen.mjs` writes from `src/`, a plan table (union) and a generator that also writes where it should
// not; assignees that leave what each quest's title says; quests taken to their seal, sealed together.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { forgeBench } from './forge-bench.ts';
import { git } from './git-plots.ts';
import { questPayload, tickUntil } from './kingdom.ts';
import type { ForgeBench } from './forge-bench.ts';
import type { Steward } from '../types.ts';

const GENERATOR = [
  "import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';",
  "mkdirSync('docs/gen', { recursive: true });",
  "writeFileSync('docs/gen/index.txt', readdirSync('src').sort().join('\\n') + '\\n');",
  '',
].join('\n');

/** A generator that rewrites the README and adds a file: neither is a hot file. */
const STRAY = [
  "import { writeFileSync } from 'node:fs';",
  "writeFileSync('README.md', 'rewritten\\n');",
  "writeFileSync('stray.txt', 'x\\n');",
  '',
].join('\n');

export const PLAN = 'one\ntwo\nthree\nfour\n';

export const QUEUE_FILES = {
  'gen.mjs': GENERATOR,
  'stray.mjs': STRAY,
  'src/a.ts': 'a\n',
  'docs/gen/index.txt': 'a.ts\n',
  'docs/plan.md': PLAN,
};

export const QUEUE_TERRITORY = {
  shared_paths: [
    { glob: 'docs/gen/**', merge: 'regenerate' },
    { glob: 'docs/plan.md', merge: 'union' },
  ],
  commands: { generate: ['node gen.mjs'] },
};

export const indexOf = (...names: string[]): string => `${['a.ts', ...names].sort().join('\n')}\n`;

/** A source file and the index its quest regenerated, as a careful assignee leaves them. */
export const sourceWithIndex = (name: string) => ({
  [`src/${name}`]: `${name}\n`,
  'docs/gen/index.txt': indexOf(name),
});

export interface QueueBenchOptions {
  readonly delivery?: Readonly<Record<string, unknown>>;
  readonly territory?: Readonly<Record<string, unknown>>;
}

/** The bench, its assignees leaving `leaves[title]`, its Steward started. */
export async function queueBench(
  leaves: Readonly<Record<string, Readonly<Record<string, string>>>>,
  options: QueueBenchOptions = {},
): Promise<{ bench: ForgeBench; steward: Steward }> {
  const bench = await forgeBench({
    delivery: options.delivery ?? { mode: 'pr_merge' },
    files: QUEUE_FILES,
    territory: { ...QUEUE_TERRITORY, ...options.territory },
    leaves: (req) => leaves[req.quest?.title ?? ''] ?? {},
  });
  return { bench, steward: await bench.start() };
}

export const statusOf = async (bench: ForgeBench, title: string) => (await bench.kingdom.quest(title)).status;

/**
 * Quests `titles` created a minute apart (so the queue's last key, the age, orders them as given), each taken to its
 * seal; then all sealed in one tick.
 */
export async function sealedTogether(
  bench: ForgeBench,
  steward: Steward,
  titles: readonly string[],
): Promise<void> {
  const { kingdom } = bench;
  for (const title of titles) {
    await kingdom.command('create_quest', questPayload(title, { seal_required: true }));
    await steward.tick();
    kingdom.clock.advance(1);
  }
  const waiting = async () =>
    (await Promise.all(titles.map((title) => statusOf(bench, title)))).every(
      (status) => status === 'awaiting_seal',
    );
  await tickUntil(steward, kingdom.clock, waiting, 120);
  for (const title of titles) await kingdom.command('seal', { quest: (await kingdom.quest(title)).id });
}

/** The titles of the quests whose `type` lines the log holds, in the log's order. */
export async function titlesOf(bench: ForgeBench, type: string): Promise<string[]> {
  const quests = await bench.kingdom.quests();
  const titleOf = new Map(quests.map((quest) => [quest.id as string, quest.title]));
  return (await bench.lines(type)).map((line) => titleOf.get(line.quest ?? '') ?? '?');
}

/** A file of the remote's main. */
export const onMain = (bench: ForgeBench, file: string): string => git(bench.remote, 'show', `main:${file}`);

/** The record a plot keeps of itself (runner-core's PlotRecord). */
export async function recordOf(worktree: string): Promise<{ base: string; update_pending?: boolean }> {
  const gitDir = git(worktree, 'rev-parse', '--path-format=absolute', '--git-dir');
  return JSON.parse(await readFile(path.join(gitDir, 'elvaria-plot.json'), 'utf8')) as { base: string };
}
