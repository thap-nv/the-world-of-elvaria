// A territory for the merge queue's specs (PS-09): a generated index under `docs/gen/` (regenerate) that a generator
// writes from `src/`, a plan table (union), and one done quest's plot on it, as `elvaria run` would leave it.
import path from 'node:path';

import type { Plot, Territory } from '@elvaria/domain';
import { fromPortable } from '@elvaria/store';

import { commitFile, git, gitRepo, questId, territoryAt } from './git-repo.ts';
import type { PlotManager } from '../plot/plot-manager.ts';

export const SHARED = [
  { glob: 'docs/gen/**', merge: 'regenerate' as const },
  { glob: 'docs/plan.md', merge: 'union' as const },
];

export const PLAN = 'one\ntwo\nthree\nfour\n';

/** The generator: the sorted names under `src/`, one per line. */
export const GENERATOR = [
  "import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';",
  "mkdirSync('docs/gen', { recursive: true });",
  "writeFileSync('docs/gen/index.txt', readdirSync('src').sort().join('\\n') + '\\n');",
  '',
].join('\n');

export const indexOf = (...names: string[]): string => `${[...names].sort().join('\n')}\n`;

export interface QueueRepo {
  readonly repo: string;
  readonly territory: Territory;
  readonly plot: Plot;
  /** The quest's worktree, native, on its branch. */
  readonly worktree: string;
  readonly branch: string;
}

/** A repo under `root` named `name` and the plot of quest `suffix` on it; `fields` go over the territory. */
export async function queueRepo(
  plots: PlotManager,
  root: string,
  name: string,
  fields: Record<string, unknown> = {},
): Promise<QueueRepo> {
  const repo = await gitRepo(path.join(root, name));
  await commitFile(repo, 'gen.mjs', GENERATOR);
  await commitFile(repo, 'docs/plan.md', PLAN);
  await commitFile(repo, 'src/a.ts', 'a\n');
  await commitFile(repo, 'docs/gen/index.txt', indexOf('a.ts'));
  const territory = territoryAt(repo, {
    shared_paths: SHARED,
    commands: { generate: ['node gen.mjs'] },
    ...fields,
  });
  const made = await plots.prepare({ id: questId('q9q9q9') }, territory);
  if (!made.ok) throw new Error(`prepare failed: ${made.error.detail}`);
  const { plot } = made.value;
  return { repo, territory, plot, worktree: fromPortable(plot.path ?? ''), branch: plot.branch ?? '' };
}

/** A new file under `src/` and the index regenerated, committed in `checkout` (main's or the quest's). */
export async function addSource(checkout: string, name: string, index: string): Promise<void> {
  await commitFile(checkout, `src/${name}`, `${name}\n`, `add ${name}`);
  await commitFile(checkout, 'docs/gen/index.txt', index, `index ${name}`);
}

export const head = (checkout: string): string => git(checkout, 'rev-parse', 'HEAD');
