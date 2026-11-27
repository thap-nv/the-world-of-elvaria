// The delivery train's bench (CM-08, CM-08b): a `deferred` territory on the forge bench, real git and one real check
// left to the train, red while the tree holds red.txt, or both src/alpha.ts and src/combo.ts (a combination: each quest
// green on its own). The assignees leave the files of each quest's title.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';

import { forgeBench } from './forge-bench.ts';
import { git } from './git-plots.ts';
import type { ForgeBench } from './forge-bench.ts';

const CHECK = [
  "import { existsSync } from 'node:fs';",
  "const red = existsSync('red.txt') || (existsSync('src/alpha.ts') && existsSync('src/combo.ts'));",
  "if (red) console.error('error: the tree is red');",
  'process.exit(red ? 1 : 0);',
  '',
].join('\n');
const CHECKS = [
  { id: 'state', run: 'node check.mjs', when: ['**'], timeout_minutes: 1, defer_to_merge: true },
];
const IDENTITY = ['-c', 'user.name=Owner', '-c', 'user.email=owner@elvaria.invalid'];
const LEAVES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  Alpha: { 'src/alpha.ts': 'alpha\n' },
  Beta: { 'src/beta.ts': 'beta\n' },
  Gamma: { 'src/gamma.ts': 'gamma\n' },
  Combo: { 'src/combo.ts': 'combo\n' },
  Clash: { 'README.md': '# clash\n' },
  Red: { 'red.txt': 'red\n' },
};

export interface TrainBenchOptions {
  /** The train's `max_quests`; 3 when absent. */
  readonly max_quests?: number;
  /** A patrolled territory (no scans): the base branch is asked before a red train is probed. */
  readonly patrolled?: boolean;
}

export const trainBenchOf = (options: TrainBenchOptions = {}): Promise<ForgeBench> =>
  forgeBench({
    delivery: { mode: 'pr_merge', merge_method: 'merge' },
    files: { 'check.mjs': CHECK },
    territory: {
      checks: CHECKS,
      check_policy: {
        mode: 'deferred',
        train: { max_quests: options.max_quests ?? 3, max_wait_minutes: 600 },
      },
      ...(options.patrolled === true ? { patrol: { scans: [] } } : {}),
    },
    leaves: (req) => LEAVES[req.quest?.title ?? ''] ?? {},
  });

export const ranOf = async (bench: ForgeBench) => (await bench.lines('train.ran')).map(({ data }) => data);
export const trainBranchesOf = (bench: ForgeBench) => git(bench.remote, 'for-each-ref', 'refs/heads/train');

/** The owner writes `file` on main on the remote, from a clone of its own. */
export async function pushToMain(bench: ForgeBench, file: string, text: string): Promise<void> {
  const folder = await tempDir('train clone');
  try {
    git(folder.root, 'clone', '-q', '-c', 'core.autocrlf=false', bench.remote, '.');
    await writeFile(path.join(folder.root, file), text);
    git(folder.root, 'add', file);
    git(folder.root, ...IDENTITY, 'commit', '-q', '-m', `owner: ${file}`);
    git(folder.root, 'push', '-q', 'origin', 'main');
  } finally {
    await folder.remove();
  }
}
