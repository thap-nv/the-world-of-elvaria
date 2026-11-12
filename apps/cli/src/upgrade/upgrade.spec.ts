// `elvaria upgrade` (PS-04b) on real git: builds are detached worktrees of a fixture repo, made in a kingdom whose
// path has a space and a Vietnamese letter; pnpm is a stub that leaves a link into the build, as pnpm's junctions
// do (a junction on Windows, a symlink on macOS). The trial here reads the build's behavior.json, so each spec
// says which build fails which step; trial.spec.ts runs the real trial.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { translator } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  MIGRATED_MARK,
  OUTSIDE_STORE,
  SHA_A,
  SHA_B,
  calls,
  placeBuild,
  readPin,
  sourceRepo,
  stubPnpm,
  writePin,
} from '../../test/builds.ts';
import { baseEnv, foundKingdom, git, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { findExecutable } from '../process/find-executable.ts';
import { cliEntryOf, hasCli } from './pointer.ts';
import { rollbackKingdom } from './rollback.ts';
import { upgradeKingdom } from './upgrade.ts';
import type { Behavior, SourceRepo } from '../../test/builds.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { UpgradeDeps } from './upgrade.ts';
import type { Trial, TrialPlace } from './trial.ts';

const short = (sha: string) => sha.slice(0, 12);

describe('elvaria upgrade', () => {
  let dir: TempDir;
  let kingdom: string;
  let source: SourceRepo;
  let deps: UpgradeDeps;
  let tried: TrialPlace[];
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    source = await sourceRepo(dir.root);
    tried = [];
    const trial: Trial = async (place) => {
      tried.push(place);
      const behavior = JSON.parse(
        await readFile(path.join(place.build, 'behavior.json'), 'utf8'),
      ) as Behavior;
      const step = behavior.trial ?? 'pass';
      return step === 'pass' ? undefined : { step, reason: 'exit:1', output: `stub: ${step} fails\n\n` };
    };
    const gitPath = await findExecutable('git', baseEnv(), process.platform);
    deps = { source: source.repo, tools: { git: gitPath ?? 'git', pnpm: await stubPnpm(dir.root) }, trial };
  });
  afterEach(() => dir.remove());

  const contextOf = async (io: TestIo = testIo()): Promise<KingdomContext> => {
    const input = { values: { kingdom, locale: 'en' }, positionals: [] };
    const ctx = await openKingdomContext(input, {
      io,
      locale: 'en',
      localeFromFlag: true,
      t: translator('en'),
    });
    if (ctx === undefined) throw new Error(printed(io));
    return ctx;
  };
  const upgrade = async (ref: string, io = testIo()) => upgradeKingdom(await contextOf(io), ref, deps);
  const builds = async () => (await readdir(path.join(kingdom, '.builds')).catch(() => [])).sort();
  const buildDir = (sha: string) => path.join(kingdom, '.builds', sha);
  const upgradeEvents = async () => {
    const files = await readdir(path.join(kingdom, 'events'));
    const text = (
      await Promise.all(files.map((file) => readFile(path.join(kingdom, 'events', file), 'utf8')))
    ).join('');
    return text
      .split('\n')
      .filter((line) => line.includes('"upgrade.'))
      .map((line) => JSON.parse(line) as { type: string; actor: unknown; data: unknown });
  };

  it('builds, tries and pins the first build, its CLI, packages and hook in place', async () => {
    const a = await source.commit({});
    const io = testIo();
    expect(await upgrade('main', io)).toBe(0);
    expect(await readPin(kingdom)).toEqual({
      version: 1,
      current: a,
      previous: null,
      switched_at: '2026-11-06T09:00:00+07:00',
    });
    expect(await hasCli(buildDir(a))).toBe(true);
    expect(await readdir(path.join(buildDir(a), 'node_modules'))).toEqual(['.pnpm', 'outside', 'pkg']);
    expect(await readdir(path.join(buildDir(a), 'packages', 'hooks', 'dist'))).toEqual(['elvaria-hook.js']);
    expect(tried).toEqual([{ build: buildDir(a), kingdom, tribes: (await contextOf()).kingdom.tribes }]);
    expect(io.printed.out).toEqual([
      `Building ${short(a)} (main) from ${source.repo} into ${buildDir(a)}.`,
      '✓ Build: git worktree, pnpm install, hook build',
      `Pinned build ${short(a)}: from now on every command on this kingdom runs on it.`,
      "The new build's migrate on the kingdom:",
      'Next: elvaria doctor, then elvaria run.',
    ]);
    expect(await upgradeEvents()).toEqual([
      expect.objectContaining({
        type: 'upgrade.started',
        actor: { kind: 'user' },
        data: { ref: 'main', to: a, from: null },
      }),
      expect.objectContaining({ type: 'upgrade.switched', data: { from: null, to: a } }),
    ]);
  });

  it('does not pin a build whose doctor fails, removes it, and keeps the kingdom on its build', async () => {
    const a = await source.commit({});
    expect(await upgrade('main')).toBe(0);
    const b = await source.commit({ trial: 'doctor' });
    const io = testIo();
    expect(await upgrade(b, io)).toBe(1);
    expect(await readPin(kingdom)).toMatchObject({ current: a, previous: null });
    expect(await builds()).toEqual([a]);
    expect(io.printed.err).toEqual([
      '    stub: doctor fails',
      `Not switched: build ${short(b)} failed at step doctor. The kingdom still runs build ${short(a)}.`,
    ]);
    expect(io.printed.out.at(-1)).toBe(`Removed build ${short(b)} from disk.`);
    expect((await upgradeEvents()).slice(2)).toEqual([
      expect.objectContaining({ type: 'upgrade.started', data: { ref: b, to: b, from: a } }),
      expect.objectContaining({ type: 'upgrade.failed', data: { to: b, step: 'doctor', reason: 'exit:1' } }),
    ]);
    expect(git(source.repo, 'worktree', 'list')).not.toContain(b);
  });

  it('pins nothing when the first build fails to install', async () => {
    const a = await source.commit({});
    deps = {
      ...deps,
      tools: { ...deps.tools, pnpm: { file: process.execPath, args: ['-e', 'process.exit(5)'] } },
    };
    const io = testIo();
    expect(await upgrade(a, io)).toBe(1);
    expect(io.printed.out).toContain('✗ Build: git worktree, pnpm install, hook build: exit:5');
    expect(io.printed.err.at(-1)).toBe(
      `Not switched: build ${short(a)} failed at step prepare. The kingdom still pins no build.`,
    );
    expect(await builds()).toEqual([]);
    expect(tried).toEqual([]);
  });

  it('keeps the build before as the way back; --rollback returns to it exactly, and back again without a rebuild', async () => {
    const a = await source.commit({});
    expect(await upgrade('main')).toBe(0);
    const c = await source.commit({});
    const io = testIo();
    expect(await upgrade('main', io)).toBe(0);
    expect(io.printed.out).toContain(
      `Pinned build ${short(c)}. The build before (${short(a)}) is kept: elvaria upgrade --rollback goes back to it.`,
    );
    expect(await readPin(kingdom)).toMatchObject({ current: c, previous: a });
    const back = testIo();
    expect(await rollbackKingdom(await contextOf(back))).toBe(0);
    expect(await readPin(kingdom)).toMatchObject({ current: a, previous: c });
    expect(back.printed.out).toEqual([
      `Went back to build ${short(a)}. The build just left (${short(c)}) is kept: elvaria upgrade --ref ${c} tries and pins it again.`,
    ]);
    expect((await upgradeEvents()).at(-1)).toMatchObject({
      type: 'upgrade.rolled_back',
      data: { from: c, to: a },
    });
    const again = testIo();
    expect(await upgrade(c, again)).toBe(0);
    expect(again.printed.out[0]).toBe(
      `Build ${short(c)} (${c}) is the one before, still at ${buildDir(c)}: it is tried again, not built again.`,
    );
    expect(await readPin(kingdom)).toMatchObject({ current: c, previous: a });
    expect(await builds()).toEqual([a, c].sort());
  });

  it('keeps two builds: the next upgrade removes the oldest, links into it and all', async () => {
    const a = await source.commit({});
    expect(await upgrade('main')).toBe(0);
    const c = await source.commit({});
    expect(await upgrade('main')).toBe(0);
    const d = await source.commit({});
    const io = testIo();
    expect(await upgrade('main', io)).toBe(0);
    expect(io.printed.out).toContain(`Removed build ${short(a)} from disk.`);
    expect(await builds()).toEqual([c, d].sort());
    // The link out of the removed build was taken off, not followed: what it led to is still there.
    expect(await readFile(path.join(dir.root, OUTSIDE_STORE, 'keep.txt'), 'utf8')).toBe('kept');
    expect(git(source.repo, 'worktree', 'list')).not.toContain(a);
  });

  it("runs the new build's migrate on the kingdom once it is pinned, and says so when it fails", async () => {
    const record = path.join(dir.root, 'calls.jsonl');
    const a = await source.commit({ record });
    expect(await upgrade('main')).toBe(0);
    expect(await readFile(path.join(kingdom, MIGRATED_MARK), 'utf8')).toBe(buildDir(a));
    const migrations = async () =>
      (await calls(record)).filter(({ argv }) => argv[0] === 'migrate').map(({ argv, root }) => [argv, root]);
    expect(await migrations()).toEqual([[['migrate', '--kingdom', kingdom], buildDir(a)]]);
    const b = await source.commit({ exit: { migrate: 6 } });
    const io = testIo();
    expect(await upgrade('main', io)).toBe(1);
    // The trial passed, so the build is pinned; the owner fixes the cause or goes back.
    expect(await readPin(kingdom)).toMatchObject({ current: b, previous: a });
    expect(io.printed.out).toContain('    stub: migrate fails');
    expect(io.printed.err.at(-1)).toBe(
      "The new build's migrate failed on the kingdom (exit:6), though it passed on the copy. The new build stays pinned: fix the cause and run elvaria migrate, or elvaria upgrade --rollback (the files migrate rewrote have their old text in .backup/).",
    );
  });

  it('does nothing when the kingdom already pins that commit', async () => {
    const a = await source.commit({});
    expect(await upgrade('main')).toBe(0);
    const io = testIo();
    expect(await upgrade(a, io)).toBe(0);
    expect(io.printed.out).toEqual([`The kingdom already pins build ${short(a)} (${a}); nothing to do.`]);
  });

  it('refuses a ref that names no commit, and a pointer it cannot read', async () => {
    await source.commit({});
    const io = testIo();
    expect(await upgrade('no-such-branch', io)).toBe(1);
    expect(io.printed.err).toEqual([`no-such-branch names no commit of ${source.repo}.`]);
    await writePin(kingdom, SHA_A);
    await writeFile(path.join(kingdom, '.state', 'build.json'), 'not json');
    const torn = testIo();
    expect(await upgrade('main', torn)).toBe(1);
    expect(printed(torn)).toContain('cannot be read');
  });

  it('refuses while a Steward runs, and so does --rollback', async () => {
    await source.commit({});
    await writePin(kingdom, SHA_A, SHA_B);
    await placeBuild(kingdom, SHA_B, {});
    let stop = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      stop = resolve;
    });
    const steward = testIo({ untilStopped: () => held });
    const running = run(steward, 'run', '--kingdom', kingdom, '--locale', 'en', '--here');
    while (!steward.printed.out.some((line) => line.startsWith('The Steward is running'))) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    try {
      const io = testIo();
      expect(await upgrade('main', io)).toBe(1);
      expect(io.printed.err).toEqual([
        `A Steward, or another upgrade, holds ${kingdom}: stop it (Ctrl+C), then run this again.`,
      ]);
      expect(await rollbackKingdom(await contextOf())).toBe(1);
      expect(await readPin(kingdom)).toMatchObject({ current: SHA_A, previous: SHA_B });
    } finally {
      stop();
      await running;
    }
  });

  it('refuses --rollback with nothing to go back to', async () => {
    const io = testIo();
    expect(await rollbackKingdom(await contextOf(io))).toBe(1);
    await writePin(kingdom, SHA_A);
    expect(await rollbackKingdom(await contextOf(io))).toBe(1);
    await writePin(kingdom, SHA_A, SHA_B);
    expect(await rollbackKingdom(await contextOf(io))).toBe(1);
    await writeFile(path.join(kingdom, '.state', 'build.json'), '{');
    expect(await rollbackKingdom(await contextOf(io))).toBe(1);
    expect(io.printed.err.slice(0, 3)).toEqual([
      'The kingdom pins no build: there is nothing to go back from.',
      `The kingdom has only build ${short(SHA_A)}: there is no build before it to go back to.`,
      `The kingdom pins build ${SHA_B}, but ${buildDir(SHA_B)} no longer holds its CLI. elvaria upgrade --rollback goes back to the build before, elvaria upgrade --ref ${SHA_B} builds it again, or add --here to run on this code.`,
    ]);
    expect(io.printed.err[3]).toContain('cannot be read');
    expect(cliEntryOf(buildDir(SHA_B))).toContain(path.join('apps', 'cli', 'src', 'cli.ts'));
  });
});
