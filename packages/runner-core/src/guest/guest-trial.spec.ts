// The try of a guest entry (CM-07) on a real repo whose path has spaces, with a bare origin: a clean head is merged
// into origin's default branch as a commit no ref names and tried in narrow mode (the base in ELVARIA_CHECK_BASE),
// its plot gone after and the session's branch untouched; a red head fails its check; a head that conflicts names
// the file; a head the branch does not have, or a territory without git, fails before any plot.
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, git, gitRepo, territoryAt } from '../__fixtures__/git-repo.ts';
import { RM_TEMP } from '../__fixtures__/temp.ts';
import { guestIdOf, tryGuest } from './guest-trial.ts';

const CHECK = [
  "import { readFileSync } from 'node:fs';",
  "console.log(`${process.argv[2] ?? 'whole'} base=${process.env.ELVARIA_CHECK_BASE ?? 'none'}`);",
  "process.exit(readFileSync('state.txt', 'utf8').trim() === 'red' ? 1 : 0);",
].join('\n');

let root = '';
let repo = '';
let kingdom = '';
const sha: Record<string, string> = {};

/** A branch of the session from `from`, `file` set to `text`, pushed to origin; its head. */
async function pushed(branch: string, from: string, file: string, text: string): Promise<string> {
  git(repo, 'switch', '-q', '-c', branch, from);
  await commitFile(repo, file, text);
  git(repo, 'push', '-q', 'origin', branch);
  const head = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'switch', '-q', 'main');
  return head;
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria guest '));
  repo = await gitRepo(path.join(root, 'Tool - Demo'));
  await commitFile(repo, 'check.mjs', CHECK);
  await commitFile(repo, 'state.txt', 'green\n');
  await commitFile(repo, 'notes.md', 'one\n');
  sha.fork = git(repo, 'rev-parse', 'HEAD');
  const origin = path.join(root, 'origin repo.git');
  git(root, 'clone', '-q', '--bare', repo, origin);
  git(repo, 'remote', 'add', 'origin', origin);
  sha.green = await pushed('feat/green', 'main', 'src/a.ts', 'a\n');
  sha.red = await pushed('feat/red', 'main', 'state.txt', 'red\n');
  sha.clash = await pushed('feat/clash', 'main', 'notes.md', 'theirs\n');
  // Origin's main moves on after the branches forked: the guest is tried on it, not on the fork point.
  await commitFile(repo, 'notes.md', 'ours\n');
  git(repo, 'push', '-q', 'origin', 'main');
  sha.main = git(repo, 'rev-parse', 'HEAD');
  kingdom = path.join(root, 'the kingdom');
  await mkdir(kingdom);
});
afterAll(() => rm(root, RM_TEMP));

const territory = () =>
  territoryAt(repo, {
    checks: [
      {
        id: 'state',
        run: 'node check.mjs',
        narrow: 'node check.mjs narrow',
        when: ['**'],
        timeout_minutes: 1,
      },
    ],
    check_policy: { mode: 'narrow' },
  });
/** The modes the try told before its checks ran (the Steward's `check.start`). */
const started: string[] = [];
const guest = (branch: string, head: string) =>
  tryGuest({
    kingdom,
    territory: territory(),
    host: TEST_HOST,
    branch,
    head,
    started: (mode) => {
      started.push(mode);
      return Promise.resolve();
    },
  });

describe('tryGuest', () => {
  it("tries a clean head merged into origin's main in narrow mode, then removes its plot", async () => {
    const tried = await guest('feat/green', sha.green ?? '');
    if (tried.state !== 'tried') throw new Error(`not tried: ${JSON.stringify(tried)}`);
    expect(tried).toMatchObject({ base: sha.main, mode: 'narrow' });
    expect(started.splice(0)).toEqual(['narrow']);
    expect(git(repo, 'rev-list', '--parents', '-n', '1', tried.commit).split(' ').slice(1)).toEqual([
      sha.main,
      sha.green,
    ]);
    expect(tried.run.trial.checks.map(({ id, pass }) => [id, pass])).toEqual([['state', true]]);
    const log = await readFile(path.join(kingdom, tried.run.trial.checks[0]?.log_path ?? ''), 'utf8');
    expect(log).toContain(`narrow base=${sha.main}`);
    expect(existsSync(path.join(repo, '.elvaria', 'worktrees', guestIdOf('demo')))).toBe(false);
    // The session's branch is never written: origin and the local branch keep their head.
    expect(git(repo, 'rev-parse', 'refs/remotes/origin/feat/green')).toBe(sha.green);
    expect(git(repo, 'rev-parse', 'feat/green')).toBe(sha.green);
  });

  it('fails the check of a red head', async () => {
    const tried = await guest('feat/red', sha.red ?? '');
    expect(tried.state === 'tried' && tried.run.trial.checks.map(({ pass }) => pass)).toEqual([false]);
    expect(started.splice(0)).toHaveLength(1);
  });

  it("names the files of a head that conflicts with origin's main, and makes no plot", async () => {
    expect(await guest('feat/clash', sha.clash ?? '')).toEqual({
      state: 'conflict',
      base: sha.main,
      paths: ['notes.md'],
    });
    // No check ran, so none started.
    expect(started.splice(0)).toEqual([]);
  });

  it("fails a head origin's branch does not have, a branch origin does not have, and a territory without git", async () => {
    expect(
      await guest('feat/green', sha.fork?.replace(/^./u, (c) => (c === 'f' ? 'e' : 'f')) ?? ''),
    ).toMatchObject({
      state: 'failed',
    });
    expect(await guest('feat/none', sha.green ?? '')).toEqual({
      state: 'failed',
      detail: 'git could not fetch feat/none from origin',
    });
    const folder = territoryAt(repo, { vcs: { type: 'none' } });
    expect(
      await tryGuest({ kingdom, territory: folder, host: TEST_HOST, branch: 'x', head: 'y' }),
    ).toMatchObject({
      state: 'failed',
    });
  });
});
