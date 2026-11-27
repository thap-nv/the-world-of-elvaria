// `territory deliver <id>` (CM-08): one `deliver` command naming the territory in the inbox for a `deferred` one, and
// nothing for an unknown territory or one checked otherwise.
import path from 'node:path';

import type { InboxCommand } from '@elvaria/domain';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, git, gitRepo, printed, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

describe('territory deliver', () => {
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

  it('refuses a territory with no delivery train, then sends the train of a deferred one off', async () => {
    const full = await cli('territory', 'deliver', 'elvaria');
    expect(full.code).toBe(1);
    expect(full.text).toContain('Territory elvaria is checked full, not deferred');
    const unknown = await cli('territory', 'deliver', 'nowhere');
    expect([unknown.code, unknown.text]).toEqual([
      1,
      expect.stringContaining('There is no territory nowhere'),
    ]);
    expect(await sent()).toEqual([]);

    for (const args of [
      ['territory', 'delivery', 'elvaria', '--mode', 'pr_merge', '--merge-method', 'merge'],
      ['territory', 'checks', 'elvaria', '--mode', 'deferred'],
    ])
      expect((await cli(...args)).code).toBe(0);
    const ordered = await cli('territory', 'deliver', 'elvaria');
    expect(ordered.code).toBe(0);
    expect(ordered.text).toContain('Sent: the delivery train of elvaria leaves at the next tick');
    expect(await sent()).toEqual([{ kind: 'deliver', source: 'cli', payload: { territory: 'elvaria' } }]);
  });
});
