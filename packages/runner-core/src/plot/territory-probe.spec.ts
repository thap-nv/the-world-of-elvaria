// The probe's git (CM-04) on a real repo whose path has spaces: the commits one head has and another has not, with
// their parents; the trial of a named commit with the red checks only, under `probe-<territory>`, its plot gone after.
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, git, gitRepo, territoryAt } from '../__fixtures__/git-repo.ts';
import { commitLinksOf, probeIdOf, tryTerritory } from './territory-trial.ts';

const STATE =
  "import { readFileSync } from 'node:fs'; process.exit(readFileSync('state.txt', 'utf8').trim() === 'red' ? 1 : 0);";
const checks = [
  { id: 'state', run: 'node state.mjs', when: ['**'], timeout_minutes: 1 },
  { id: 'other', run: 'node state.mjs', when: ['**'], timeout_minutes: 1 },
];

let root = '';
let repo = '';
let kingdom = '';
const sha: Record<string, string> = {};
let temp: TempDir;
beforeAll(async () => {
  temp = await tempDir('probe');
  root = temp.root;
  repo = await gitRepo(path.join(root, 'Tool - Demo'));
  await commitFile(repo, 'state.mjs', STATE);
  await commitFile(repo, 'state.txt', 'green\n');
  sha.green = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'switch', '-q', '-c', 'quest/a');
  await commitFile(repo, 'state.txt', 'red\n');
  sha.quest = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'switch', '-q', 'main');
  await commitFile(repo, 'notes.md', '# notes\n');
  sha.owner = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge quest/a', 'quest/a');
  sha.merge = git(repo, 'rev-parse', 'HEAD');
  kingdom = path.join(root, 'the kingdom');
  await mkdir(kingdom);
});
afterAll(() => temp.remove());

describe('commitLinksOf', () => {
  it('the commits the head has and the excluded one has not, each with its parents', async () => {
    const links = await commitLinksOf({
      territory: territoryAt(repo),
      host: TEST_HOST,
      head: sha.merge ?? '',
      exclude: sha.green ?? '',
    });
    expect(links?.toSorted((a, b) => a.commit.localeCompare(b.commit))).toEqual(
      [
        { commit: sha.merge, parents: [sha.owner, sha.quest] },
        { commit: sha.owner, parents: [sha.green] },
        { commit: sha.quest, parents: [sha.green] },
      ].toSorted((a, b) => (a.commit ?? '').localeCompare(b.commit ?? '')),
    );
  });

  it('undefined when git does not know a commit, or the territory has no git', async () => {
    const territory = territoryAt(repo);
    const unknown = { territory, host: TEST_HOST, head: 'f'.repeat(40), exclude: sha.green ?? '' };
    expect(await commitLinksOf(unknown)).toBeUndefined();
    const folder = { ...territory, vcs: { type: 'none' } } as unknown as typeof territory;
    expect(await commitLinksOf({ ...unknown, territory: folder })).toBeUndefined();
  });
});

describe('tryTerritory as the probe', () => {
  it('tries the commit named, without a fetch, with the checks named only; the plot goes', async () => {
    const run = (commit: string) =>
      tryTerritory({
        kingdom,
        territory: territoryAt(repo, { checks }),
        host: TEST_HOST,
        name: probeIdOf('demo'),
        commit,
        checks: ['state'],
      });
    const red = await run(sha.quest ?? '');
    expect(red.trial.base).toBe(sha.quest);
    expect(red.trial.checks.map(({ id, pass, log_path: log }) => ({ id, pass, log }))).toEqual([
      { id: 'state', pass: false, log: '.runs/probe-demo/checks/state.log' },
    ]);
    const green = await run(sha.owner ?? '');
    expect(green.trial.checks.map(({ id, pass }) => ({ id, pass }))).toEqual([{ id: 'state', pass: true }]);
    expect(existsSync(path.join(repo, '.elvaria', 'worktrees', probeIdOf('demo')))).toBe(false);
  });
});
