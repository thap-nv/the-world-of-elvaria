// `elvaria upgrade` warns when the local branch it builds from lacks commits of `origin/<branch>` ((176)(b)), on real
// git with no remote and no network: `origin/main` is a ref set by hand, as the last fetch would have left it.
import { translator } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sourceRepo, stubPnpm } from '../../test/builds.ts';
import { baseEnv, git, tempDir, testIo } from '../../test/cli.ts';
import { findExecutable } from '../process/find-executable.ts';
import { behindOf, warnIfBehind } from './behind.ts';
import type { SourceRepo } from '../../test/builds.ts';
import type { TempDir } from '../../test/cli.ts';
import type { Tools } from './build.ts';

const t = translator('en');

describe('a local branch behind origin', () => {
  let dir: TempDir;
  let source: SourceRepo;
  let tools: Tools;
  let first: string;
  let last: string;
  beforeEach(async () => {
    dir = await tempDir();
    source = await sourceRepo(dir.root);
    const gitPath = await findExecutable('git', baseEnv(), process.platform);
    tools = { git: gitPath ?? 'git', pnpm: await stubPnpm(dir.root) };
    first = await source.commit({});
    await source.commit({});
    last = await source.commit({});
  });
  afterEach(() => dir.remove());

  const behind = (ref: string) => behindOf(tools, testIo(), source.repo, ref);
  const setRef = (name: string, sha: string) => git(source.repo, 'update-ref', name, sha);

  it('counts what origin/<ref> has that the local branch lacks, as last fetched', async () => {
    expect(await behind('main')).toBeUndefined();
    setRef('refs/remotes/origin/main', last);
    expect(await behind('main')).toBeUndefined();
    setRef('refs/heads/main', first);
    expect(await behind('main')).toEqual({ upstream: 'origin/main', count: 2 });
    // Ahead of origin (commits not pushed yet) is not behind.
    setRef('refs/remotes/origin/main', first);
    setRef('refs/heads/main', last);
    expect(await behind('main')).toBeUndefined();
  });

  it('says nothing for a ref that is no local branch', async () => {
    setRef('refs/remotes/origin/main', last);
    setRef('refs/heads/main', first);
    expect(await behind('origin/main')).toBeUndefined();
    expect(await behind(first)).toBeUndefined();
    expect(await behind('no-such-branch')).toBeUndefined();
  });

  it('warns once, saying no fetch was made and how to build the newer code', async () => {
    const io = testIo();
    await warnIfBehind({ io, t }, tools, source.repo, 'main');
    expect(io.printed.err).toEqual([]);
    setRef('refs/remotes/origin/main', last);
    setRef('refs/heads/main', first);
    await warnIfBehind({ io, t }, tools, source.repo, 'main');
    expect(io.printed.err).toEqual([
      `Warning: local main is 2 commits behind origin/main as ${source.repo} last fetched it (upgrade does not fetch), and the build is made from local main. To build the newer code, git pull in ${source.repo} first, or give --ref origin/main.`,
    ]);
    expect(io.printed.out).toEqual([]);
  });
});
