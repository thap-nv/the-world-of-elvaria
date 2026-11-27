// The delivery train (CM-08) on a real repo whose path has spaces, with a bare origin whose main moved on after the
// quests forked: each quest's branch is merged in order into origin's main, a hot file resolved by its rule and
// regenerated after setup, a quest that conflicts leaves with its files, every check runs on the train's head, and
// the plot goes; a red quest fails the check, a failing generator or a missing branch stops the train, and a train
// every quest left runs nothing.
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, git, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import { trainPlotOf, tryTrain } from './train-trial.ts';
import type { TrainHead, TrainTrial } from './train-trial.ts';

// The check is red on a red state, or on an index the generator did not write for every file of src/.
const CHECK = [
  "import { readFileSync, readdirSync } from 'node:fs';",
  "const index = readdirSync('src').sort().map((file) => `${file}\\n`).join('');",
  "const red = readFileSync('state.txt', 'utf8').trim() === 'red' || readFileSync('index.txt', 'utf8') !== index;",
  'process.exit(red ? 1 : 0);',
].join('\n');
// The generator needs what setup made, as one needs its deps: setup runs first.
const GENERATE = [
  "import { existsSync, readdirSync, writeFileSync } from 'node:fs';",
  "if (!existsSync('setup.txt')) process.exit(1);",
  "writeFileSync('index.txt', readdirSync('src').sort().map((file) => `${file}\\n`).join(''));",
].join('\n');
const SETUP = "import { writeFileSync } from 'node:fs';\nwriteFileSync('setup.txt', 'ready');";

let root = '';
let repo = '';
let kingdom = '';
const sha: Record<string, string> = {};

/** A quest's branch from main, `file` set to `text` (and the index when given); its head. */
async function quest(branch: string, file: string, text: string, index?: string): Promise<string> {
  git(repo, 'switch', '-q', '-c', branch, 'main');
  await commitFile(repo, file, text);
  if (index !== undefined) await commitFile(repo, 'index.txt', index);
  const head = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'switch', '-q', 'main');
  return head;
}

let temp: TempDir;
beforeAll(async () => {
  temp = await tempDir('train');
  root = temp.root;
  repo = await gitRepo(path.join(root, 'Tool - Demo'));
  await commitFile(repo, 'check.mjs', CHECK);
  await commitFile(repo, 'gen.mjs', GENERATE);
  await commitFile(repo, 'setup.mjs', SETUP);
  await commitFile(repo, 'state.txt', 'green\n');
  await commitFile(repo, 'notes.md', 'one\n');
  await commitFile(repo, 'src/base.ts', 'base\n');
  await commitFile(repo, 'index.txt', 'base.ts\n');
  const origin = path.join(root, 'origin repo.git');
  git(root, 'clone', '-q', '--bare', repo, origin);
  git(repo, 'remote', 'add', 'origin', origin);
  sha.a = await quest('quest/a', 'src/a.ts', 'a\n', 'a.ts\nbase.ts\n');
  sha.b = await quest('quest/b', 'src/b.ts', 'b\n', 'b.ts\nbase.ts\n');
  sha.clash = await quest('quest/clash', 'notes.md', 'theirs\n');
  sha.red = await quest('quest/red', 'state.txt', 'red\n');
  // Origin's main moves on after the quests forked: the train is cut from it, not from the fork point.
  await commitFile(repo, 'notes.md', 'ours\n');
  git(repo, 'push', '-q', 'origin', 'main');
  sha.main = git(repo, 'rev-parse', 'HEAD');
  kingdom = path.join(root, 'the kingdom');
  await mkdir(kingdom);
});
afterAll(() => temp.remove());

const territory = (generate = 'node gen.mjs') =>
  territoryAt(repo, {
    commands: { setup: 'node setup.mjs', generate: [generate] },
    shared_paths: [{ glob: 'index.txt', merge: 'regenerate' }],
    checks: [{ id: 'state', run: 'node check.mjs', when: ['**'], timeout_minutes: 1 }],
  });
const id = {
  a: questId('aaaaaa'),
  b: questId('bbbbbb'),
  clash: questId('cccccc'),
  red: questId('dddddd'),
  none: questId('eeeeee'),
};
/** The heads the train told before its checks ran (the Steward's `check.start`). */
const started: TrainHead[] = [];
const train = (quests: readonly (keyof typeof id)[], generate?: string) =>
  tryTrain({
    kingdom,
    territory: territory(generate),
    host: TEST_HOST,
    quests: quests.map((name) => ({ quest: id[name], branch: `quest/${name}` })),
    started: (point) => {
      started.push(point);
      return Promise.resolve();
    },
  });
const parentsOf = (commit: string) =>
  git(repo, 'rev-list', '--parents', '-n', '1', commit).split(' ').slice(1);
const plotGone = () => !existsSync(path.join(repo, '.elvaria', 'worktrees', trainPlotOf('demo')));
const tried = (trial: TrainTrial) => {
  if (trial.state !== 'tried') throw new Error(`not tried: ${JSON.stringify(trial)}`);
  return trial;
};

describe('tryTrain', () => {
  it("merges each quest in order into origin's main, lets a conflict leave, regenerates, checks, removes its plot", async () => {
    const trial = tried(await train(['a', 'clash', 'b']));
    expect(trial.base).toBe(sha.main);
    expect(trial.left).toEqual([{ quest: id.clash, paths: ['notes.md'] }]);
    expect(trial.steps.map(({ quest, head }) => [quest, head])).toEqual([
      [id.a, sha.a],
      [id.b, sha.b],
    ]);
    const [first, second] = trial.steps;
    expect(parentsOf(first?.commit ?? '')).toEqual([sha.main, sha.a]);
    expect(parentsOf(second?.commit ?? '')).toEqual([first?.commit, sha.b]);
    // index.txt conflicted between a and b, kept by its rule, then rewritten by the generator in a commit of its own.
    expect(parentsOf(trial.head)).toEqual([second?.commit]);
    expect(git(repo, 'show', `${trial.head}:index.txt`)).toBe('a.ts\nb.ts\nbase.ts');
    expect(trial.tree).toBe(git(repo, 'rev-parse', `${trial.head}^{tree}`));
    expect(started.splice(0)).toEqual([{ head: trial.head, tree: trial.tree }]);
    expect(trial.run.trial.setup?.pass).toBe(true);
    expect(trial.run.trial.checks.map(({ id: check, pass }) => [check, pass])).toEqual([['state', true]]);
    const log = path.join(kingdom, '.runs', `${trainPlotOf('demo')}-delivery`, 'generate.log');
    expect(await readFile(log, 'utf8')).toContain('$ node gen.mjs');
    expect(plotGone()).toBe(true);
    // The quests' branches are never written.
    expect(git(repo, 'rev-parse', 'quest/a')).toBe(sha.a);
  });

  it('fails the check of a red quest', async () => {
    const trial = tried(await train(['red']));
    expect(trial.run.trial.checks.map(({ pass }) => pass)).toEqual([false]);
    expect(started.splice(0)).toHaveLength(1);
  });

  it('stops on a generator that fails, and on a branch the repo does not have, its merges told', async () => {
    const generated = await train(['a'], 'node missing.mjs');
    expect(generated).toMatchObject({
      state: 'stopped',
      reason: 'generate_failed',
      base: sha.main,
      left: [],
    });
    expect(generated.steps.map(({ quest }) => quest)).toEqual([id.a]);
    expect(await train(['a', 'none'])).toMatchObject({
      state: 'stopped',
      reason: 'update_failed',
      detail: 'the repo has no branch quest/none',
      steps: [{ quest: id.a, head: sha.a }],
    });
    expect(started.splice(0)).toEqual([]);
    expect(plotGone()).toBe(true);
  });

  it('runs nothing on a train every quest left, and stops without git or origin', async () => {
    expect(await train(['clash'])).toEqual({
      state: 'empty',
      base: sha.main,
      steps: [],
      left: [{ quest: id.clash, paths: ['notes.md'] }],
    });
    const folder = territoryAt(repo, { vcs: { type: 'none' } });
    expect(await tryTrain({ kingdom, territory: folder, host: TEST_HOST, quests: [] })).toMatchObject({
      state: 'stopped',
      reason: 'update_failed',
    });
    const lost = territoryAt(repo, { vcs: { type: 'git', default_branch: 'gone' } });
    expect(await tryTrain({ kingdom, territory: lost, host: TEST_HOST, quests: [] })).toEqual({
      state: 'stopped',
      reason: 'update_failed',
      detail: 'git could not fetch gone from origin',
      steps: [],
      left: [],
    });
    expect(started).toEqual([]);
  });
});
