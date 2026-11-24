// `territory enqueue <id> --pr <n>` (CM-07): one `enqueue_branch` command in the inbox for a territory the Steward merges
// in (pr_merge), and nothing for a number that is not one, an unknown territory, or one delivered otherwise.
import path from 'node:path';

import type { InboxCommand } from '@elvaria/domain';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, git, gitRepo, printed, run, tempDir, testIo } from '../../test/cli.ts';
import type { TempDir } from '../../test/cli.ts';

describe('territory enqueue', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    const repo = await gitRepo(path.join(dir.root, 'repo elvaria'));
    git(repo, 'remote', 'add', 'origin', 'https://github.com/elvaria-specs/elvaria.git');
    const io = testIo();
    if ((await run(io, 'territory', 'add', repo, '--id', 'elvaria', '--kingdom', kingdom)) !== 0)
      throw new Error(printed(io));
  });
  afterEach(() => dir.remove());

  const cli = async (...args: string[]) => {
    const io = testIo();
    const code = await run(io, ...args, '--kingdom', kingdom, '--locale', 'en');
    return { code, text: printed(io) };
  };
  const sent = async () =>
    (await openKingdom(kingdom).inbox.read())
      .flatMap(({ command }) => (command.ok ? [command.value] : []))
      .map(({ kind, source, payload }: InboxCommand) => ({ kind, source, payload }));

  it('refuses a territory the Steward does not merge in, then sends the guest of a pr_merge one', async () => {
    const manual = await cli('territory', 'enqueue', 'elvaria', '--pr', '12');
    expect(manual.code).toBe(1);
    expect(manual.text).toContain('Territory elvaria delivers by manual, not pr_merge');
    expect((await cli('territory', 'enqueue', 'nowhere', '--pr', '12')).text).toContain(
      'There is no territory nowhere',
    );
    expect((await cli('territory', 'delivery', 'elvaria', '--mode', 'pr_merge')).code).toBe(0);
    for (const bad of ['0', '-3', '1.5', 'abc']) {
      const refused = await cli('territory', 'enqueue', 'elvaria', `--pr=${bad}`);
      expect([refused.code, refused.text]).toEqual([2, expect.stringContaining(`not ${bad}`) as string]);
    }
    expect(await sent()).toEqual([]);

    const queued = await cli('territory', 'enqueue', 'elvaria', '--pr', '12');
    expect(queued.code).toBe(0);
    expect(queued.text).toContain('Sent: pull request #12 waits in the merge queue of elvaria');
    expect(await sent()).toEqual([
      { kind: 'enqueue_branch', source: 'cli', payload: { territory: 'elvaria', pr: 12 } },
    ]);
  });
});
