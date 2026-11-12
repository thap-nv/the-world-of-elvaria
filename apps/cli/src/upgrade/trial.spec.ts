// The trial of a new build (PS-04b), run for real: every step is a child process of the build's stub CLI, on a copy
// of the kingdom's settings (mirror.ts) or, for the script-tier quest, on a throwaway kingdom with a git territory;
// the "Steward" the trial starts is killed with its tree once the verdict is read. The stub records each call, so a spec reads which words reached the build.
import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { TribeSchema } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MIGRATED_MARK, SHA_A, calls, placeBuild } from '../../test/builds.ts';
import { baseEnv, tempDir, testIo } from '../../test/cli.ts';
import { findExecutable } from '../process/find-executable.ts';
import { mirrorKingdom } from './mirror.ts';
import { buildTrial } from './trial.ts';
import type { Behavior } from '../../test/builds.ts';
import type { TempDir } from '../../test/cli.ts';
import type { Tools } from './build.ts';
import type { TrialPlace } from './trial.ts';

const TRIBES = [
  { id: 'claude', adapter: 'claude_code', enabled: true, max_concurrent: 1 },
  { id: 'gemini', adapter: 'antigravity', enabled: true, max_concurrent: 1 },
  { id: 'codex', adapter: 'codex_cli', enabled: false, max_concurrent: 1 },
].map((tribe) => TribeSchema.parse(tribe));

describe('the trial of a new build', () => {
  let dir: TempDir;
  let kingdom: string;
  let record: string;
  let tools: Tools;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = path.join(dir.root, 'vương quốc');
    record = path.join(dir.root, 'calls.jsonl');
    const git = await findExecutable('git', baseEnv(), process.platform);
    tools = { git: git ?? 'git', pnpm: { file: process.execPath, args: [] } };
  });
  afterEach(() => dir.remove());

  const tryWith = async (behavior: Behavior, tribes = TRIBES) => {
    const build = await placeBuild(kingdom, SHA_A, { ...behavior, record });
    const lines: string[] = [];
    const place: TrialPlace = { build, kingdom, tribes };
    const io = testIo({
      env: { ...baseEnv(), NPM_TOKEN: 'npm_secret', GIT_DIR: path.join(dir.root, '.git') },
    });
    const failure = await buildTrial(tools, io)(place, {
      t: translator('en'),
      out: (line) => lines.push(line),
    });
    return { build, failure, lines, calls: await calls(record) };
  };

  it("passes a build whose migrate, doctor, suites and script quest pass, each run as the build's own command", async () => {
    await mkdir(path.join(kingdom, 'registry'), { recursive: true });
    await writeFile(path.join(kingdom, 'kingdom.json'), '{}');
    // doctor passes only on a kingdom the build's migrate ran on: the trial runs both on the same copy.
    const { build, failure, lines, calls: made } = await tryWith({ needs_migrate: true });
    expect(failure).toBeUndefined();
    expect(lines).toEqual([
      "✓ Trial: the new build's migrate on a copy of this kingdom's settings",
      "✓ Trial: the new build's doctor on that copy",
      '✓ Trial: the conformance suite of tribe claude against a fake CLI',
      '✓ Trial: the conformance suite of tribe gemini against a fake CLI',
      '✓ Trial: a script-tier quest on a throwaway kingdom',
    ]);
    const mirror = made[0]?.argv[2] ?? '';
    expect(mirror).not.toBe(kingdom);
    expect(path.basename(path.dirname(mirror))).toMatch(/^elvaria upgrade mirror /);
    const fake = (...parts: string[]) => path.join(build, 'packages', ...parts);
    const on = ['--kingdom', mirror];
    const suite = (tribe: string, cli: string) => [
      'tribe',
      'check',
      tribe,
      '--scenarios',
      '--tool',
      cli,
      ...on,
    ];
    expect(made.slice(0, 4).map(({ argv }) => argv)).toEqual([
      ['migrate', ...on],
      ['doctor', ...on],
      suite('claude', fake('runner-claude', 'fixtures', 'fake-claude.mjs')),
      suite('gemini', fake('runner-antigravity', 'fixtures', 'fake-agy.mjs')),
    ]);
    const throwaway = made[4]?.argv[2] ?? '';
    const at = ['--kingdom', throwaway];
    const script = ['--script', 'count-files', '--params', '{"globs":["**/*.md"]}'];
    const quest = ['--territory', 'land', '--kind', 'analyze', '--rank', 'E', '--title', 'upgrade-trial'];
    expect(made.slice(4).map(({ argv }) => argv)).toEqual([
      ['init', ...at, '--name', 'upgrade-trial'],
      ['tribe', 'disable', 'claude', ...at],
      ['tribe', 'disable', 'gemini', ...at],
      ['territory', 'add', path.join(path.dirname(throwaway), 'land'), ...at],
      ['quest', 'add', ...quest, '--description', 'upgrade-trial', ...script, ...at],
      ['run', ...at],
    ]);
    expect(path.basename(path.dirname(throwaway))).toMatch(/^elvaria upgrade /);
    // Every child ran in the build, with nothing of the owner's env but the minimal list.
    for (const call of made) {
      expect(call).toMatchObject({ root: build, cwd: build, pinned: null, token: null, git_dir: null });
    }
    // The kingdom itself was not written; the copy and the throwaway kingdom are gone.
    expect(await readdir(kingdom)).not.toContain(MIGRATED_MARK);
    await expect(access(path.dirname(mirror))).rejects.toThrow();
    await expect(access(path.dirname(throwaway))).rejects.toThrow();
  });

  it('copies the settings of a kingdom, not its quests, log, inbox or state', async () => {
    const files = [
      'kingdom.json',
      'decree.md',
      'registry/memos.json',
      'territories/dc1/territory.json',
      'characters/thorn/character.json',
      'quests/q_20261112_aaaaaa.json',
      'events/2026-11-12.jsonl',
      '.state/build.json',
    ];
    for (const file of files) {
      await mkdir(path.dirname(path.join(kingdom, file)), { recursive: true });
      await writeFile(path.join(kingdom, file), file);
    }
    const mirror = path.join(dir.root, 'bản sao');
    await mirrorKingdom(kingdom, mirror);
    expect((await readdir(mirror)).sort()).toEqual([
      'characters',
      'decree.md',
      'kingdom.json',
      'registry',
      'territories',
    ]);
    expect(await readdir(path.join(mirror, 'territories', 'dc1'))).toEqual(['territory.json']);
  });

  it('stops at a migrate that fails, before doctor', async () => {
    const { failure, lines, calls: made } = await tryWith({ exit: { migrate: 5 } });
    expect(failure).toEqual({ step: 'migrate', reason: 'exit:5', output: 'stub: migrate fails\n' });
    expect(lines).toEqual(["✗ Trial: the new build's migrate on a copy of this kingdom's settings: exit:5"]);
    expect(made).toHaveLength(1);
  });

  it('stops at a doctor that fails, with its exit code and what it printed', async () => {
    const { failure, lines, calls: made } = await tryWith({ exit: { doctor: 1 } });
    expect(failure).toEqual({ step: 'doctor', reason: 'exit:1', output: 'stub: doctor fails\n' });
    expect(lines.at(-1)).toBe("✗ Trial: the new build's doctor on that copy: exit:1");
    expect(made).toHaveLength(2);
  });

  it('stops at a conformance suite that fails, and skips a tribe whose adapter has no fake CLI', async () => {
    const lantern = TribeSchema.parse({
      id: 'lantern',
      adapter: 'adapters/lantern.mjs',
      enabled: true,
      max_concurrent: 1,
    });
    const { failure, lines } = await tryWith({ exit: { 'tribe check': 2 } }, [lantern, ...TRIBES]);
    expect(failure).toMatchObject({ step: 'conformance', reason: 'exit:2' });
    expect(lines.slice(2)).toEqual([
      "– Tribe lantern: the build carries no fake CLI for adapter adapters/lantern.mjs, so its conformance suite does not run; elvaria tribe check lantern runs it with the tribe's CLI.",
      '✗ Trial: the conformance suite of tribe claude against a fake CLI: exit:2',
    ]);
  });

  it.each([
    ['a verdict that fails', { run: 'verdict.fail' } as const, 'verdict.fail'],
    ['a Steward that stops before any verdict', { run: 'exit' } as const, 'exit:4'],
    ['a throwaway kingdom that cannot be founded', { exit: { init: 3 } }, 'exit:3'],
    ['a quest that cannot be added', { exit: { 'quest add': 2 } }, 'exit:2'],
  ])('fails the script-tier quest on %s', async (_, behavior, reason) => {
    const { failure, lines } = await tryWith(behavior);
    expect(failure).toMatchObject({ step: 'trial', reason });
    expect(lines.at(-1)).toBe(`✗ Trial: a script-tier quest on a throwaway kingdom: ${reason}`);
  });
});
