// The territory's generators run by the machine after the merge queue's update (PS-09): the hot files they rewrite
// committed by the Steward, any other file they touch given back, a failure said with the end of their log.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, git } from '../__fixtures__/git-repo.ts';
import { addSource, head, indexOf, queueRepo } from '../__fixtures__/queue-repo.ts';
import { createPlotManager } from './plot-manager.ts';

let root = '';
let kingdom = '';
let temp: TempDir;
beforeAll(async () => {
  temp = await tempDir('generate');
  root = temp.root;
  kingdom = path.join(root, 'my kingdom');
});
afterAll(() => temp.remove());

const plots = () => createPlotManager({ kingdom, host: TEST_HOST });
const STRAY = [
  "import { writeFileSync } from 'node:fs';",
  "writeFileSync('README.md', 'rewritten\\n');",
  "writeFileSync('stray.txt', 'x\\n');",
  '',
].join('\n');

describe('the generators after an update (PS-09)', () => {
  it('commits the regenerated hot file, so the index holds both sides', async () => {
    const { repo, territory, plot, worktree, branch } = await queueRepo(plots(), root, 'regenerate');
    await addSource(worktree, 'q.ts', indexOf('a.ts', 'q.ts'));
    await addSource(repo, 'm.ts', indexOf('a.ts', 'm.ts'));
    await plots().update(plot, territory);

    const outcome = await plots().generate(plot, territory, { quest_id: 'q_20261107_q9q9q9' });

    expect(outcome).toEqual({ status: 'done', sha: head(worktree), restored: [] });
    expect(git(worktree, 'log', '-1', '--format=%s')).toBe(
      `chore: regenerate files after merging into ${branch}`,
    );
    expect(await readFile(path.join(worktree, 'docs', 'gen', 'index.txt'), 'utf8')).toBe(
      indexOf('a.ts', 'm.ts', 'q.ts'),
    );
    const log = await readFile(
      path.join(kingdom, '.runs', 'q_20261107_q9q9q9-delivery', 'generate.log'),
      'utf8',
    );
    expect(log).toContain('$ node gen.mjs');
  });

  it('commits nothing when the generators change nothing', async () => {
    const { territory, plot, worktree } = await queueRepo(plots(), root, 'nothing');
    const before = head(worktree);

    expect(await plots().generate(plot, territory, { quest_id: 'q_20261107_q9q9q9' })).toEqual({
      status: 'done',
      restored: [],
    });
    expect(head(worktree)).toBe(before);
  });

  it('gives back what a generator changed outside the hot files, and names it', async () => {
    const generate = ['node gen.mjs', 'node stray.mjs'];
    const { territory, plot, worktree } = await queueRepo(plots(), root, 'stray', { commands: { generate } });
    await commitFile(worktree, 'stray.mjs', STRAY);
    await commitFile(worktree, 'src/q.ts', 'q\n');

    const outcome = await plots().generate(plot, territory, { quest_id: 'q_20261107_q9q9q9' });

    expect(outcome).toMatchObject({ status: 'done', restored: ['README.md', 'stray.txt'] });
    expect(await readFile(path.join(worktree, 'README.md'), 'utf8')).toBe('# demo\n');
    expect(git(worktree, 'status', '--porcelain')).toBe('');
    expect(git(worktree, 'show', '--name-only', '--format=', 'HEAD')).toBe('docs/gen/index.txt');
  });

  it('fails with its log when a generator fails, and when the Steward stops it', async () => {
    const generate = ['node gen.mjs', 'node -e "console.log(\'generator broke\'); process.exit(3)"'];
    const { territory, plot } = await queueRepo(plots(), root, 'failing', { commands: { generate } });

    const outcome = await plots().generate(plot, territory, { quest_id: 'q_20261107_q9q9q9' });
    expect(outcome).toMatchObject({
      status: 'failed',
      log_path: '.runs/q_20261107_q9q9q9-delivery/generate.log',
    });
    expect(outcome.status === 'failed' ? outcome.detail : '').toContain('generator broke');

    const stopped = await plots().generate(plot, territory, {
      quest_id: 'q_20261107_q9q9q9',
      signal: AbortSignal.abort(),
    });
    expect(stopped).toMatchObject({ status: 'failed' });
  });

  it('has nothing to run on a territory without generators', async () => {
    const { territory, plot } = await queueRepo(plots(), root, 'none');
    const bare = { ...territory, commands: { ...territory.commands, generate: [] } };

    expect(await plots().generate(plot, bare, { quest_id: 'q_20261107_q9q9q9' })).toEqual({ status: 'none' });
  });
});
