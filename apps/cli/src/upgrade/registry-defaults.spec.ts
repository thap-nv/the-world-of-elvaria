// `elvaria upgrade` and the registry defaults a new build changed (fix/kingdom-upkeep), on real git builds of a fixture
// repo whose commits carry a small packages/registry-default: a prompt the kingdom still holds as the build before had
// it takes the new text, with a backup; one the owner edited is named with the diff to read; a ritual entry likewise.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { translator } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sourceRepo, stubPnpm } from '../../test/builds.ts';
import { baseEnv, foundKingdom, printed, tempDir, testIo } from '../../test/cli.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { findExecutable } from '../process/find-executable.ts';
import { upgradeKingdom } from './upgrade.ts';
import type { SourceRepo } from '../../test/builds.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';
import type { UpgradeDeps } from './upgrade.ts';

const short = (sha: string) => sha.slice(0, 12);
const REGISTRY = ['packages', 'registry-default'];
const BACKUP = '.backup/20261106T090000-registry';

interface Ritual {
  readonly id: string;
  readonly max_seconds: number;
}

describe('elvaria upgrade: the registry defaults the new build changed', () => {
  let dir: TempDir;
  let kingdom: string;
  let source: SourceRepo;
  let deps: UpgradeDeps;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    source = await sourceRepo(dir.root);
    // As in the Elvaria repo: a build checks its files out with LF whatever core.autocrlf says.
    await writeFile(path.join(source.repo, '.gitattributes'), '* text=auto eol=lf\n');
    const gitPath = await findExecutable('git', baseEnv(), process.platform);
    const trial = () => Promise.resolve(undefined);
    deps = { source: source.repo, tools: { git: gitPath ?? 'git', pnpm: await stubPnpm(dir.root) }, trial };
  });
  afterEach(() => dir.remove());

  const upgrade = async (io: TestIo = testIo()) => {
    const input = { values: { kingdom, locale: 'en' }, positionals: [] };
    const ctx = await openKingdomContext(input, {
      io,
      locale: 'en',
      localeFromFlag: true,
      t: translator('en'),
    });
    if (ctx === undefined) throw new Error(printed(io));
    return upgradeKingdom(ctx, 'main', deps);
  };
  const inKingdom = (relative: string) => readFile(path.join(kingdom, ...relative.split('/')), 'utf8');
  const buildRegistry = (sha: string, file: string) =>
    path.join(kingdom, '.builds', sha, ...REGISTRY, ...file.split('/'));
  /** Writes the build's default `file` into the source repo, for the next commit. */
  const writeDefault = async (file: string, text: string) => {
    const target = path.join(source.repo, ...REGISTRY, ...file.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
  };
  const rituals = async () => JSON.parse(await inKingdom('registry/rituals.json')) as { rituals: Ritual[] };

  it("brings in what the kingdom still held as the build before had it, and names the owner's edits", async () => {
    const mage = await inKingdom('registry/prompts/mage.md');
    const chancellor = await inKingdom('registry/prompts/chancellor.md');
    const ritualsText = await inKingdom('registry/rituals.json');
    await writeDefault('prompts/mage.md', mage);
    await writeDefault('prompts/chancellor.md', chancellor);
    await writeDefault('rituals.json', ritualsText);
    const a = await source.commit({});
    const first = testIo();
    expect(await upgrade(first)).toBe(0);
    expect(printed(first)).not.toContain('Registry defaults');
    await writeFile(
      path.join(kingdom, 'registry', 'prompts', 'chancellor.md'),
      `${chancellor}\nMy own rule.\n`,
    );
    await writeDefault('prompts/mage.md', `${mage}\nCheck the plan file.\n`);
    await writeDefault('prompts/chancellor.md', `${chancellor}\nA new default rule.\n`);
    const before = await rituals();
    const [ritual] = before.rituals;
    if (ritual === undefined) throw new Error('no ritual');
    const changed = { ...ritual, max_seconds: ritual.max_seconds + 60 };
    await writeDefault(
      'rituals.json',
      JSON.stringify({ ...before, rituals: [changed, ...before.rituals.slice(1)] }),
    );
    const b = await source.commit({});
    const io = testIo();
    expect(await upgrade(io)).toBe(0);
    const out = io.printed.out;
    const at = out.indexOf(
      `Brought 2 registry defaults the new build changed into the kingdom, which still held the default of the build before; the old text is in ${BACKUP}:`,
    );
    expect(at).toBeGreaterThan(-1);
    expect(out.slice(at + 1, at + 6)).toEqual([
      '  registry/prompts/mage.md',
      `  registry/rituals.json: ${ritual.id}`,
      '1 registry defaults the new build changed were edited in the kingdom, so they are left as they are; bring the change in by hand (back up first, then compare: operating-a-kingdom §12). What the default changed:',
      '  registry/prompts/chancellor.md',
      `    git diff --no-index -- "${buildRegistry(a, 'prompts/chancellor.md')}" "${buildRegistry(b, 'prompts/chancellor.md')}"`,
    ]);
    expect(await inKingdom('registry/prompts/mage.md')).toBe(`${mage}\nCheck the plan file.\n`);
    expect(await inKingdom(`${BACKUP}/registry/prompts/mage.md`)).toBe(mage);
    expect(await inKingdom('registry/prompts/chancellor.md')).toBe(`${chancellor}\nMy own rule.\n`);
    expect((await rituals()).rituals[0]).toEqual(changed);
    expect(await inKingdom(`${BACKUP}/registry/rituals.json`)).toBe(ritualsText);
    expect(io.printed.err).toEqual([]);
  });

  it('says when nothing is left to bring in, and when the build before has no registry to compare', async () => {
    const a = await source.commit({});
    expect(await upgrade()).toBe(0);
    await writeDefault('prompts/mage.md', await inKingdom('registry/prompts/mage.md'));
    const b = await source.commit({});
    const io = testIo();
    expect(await upgrade(io)).toBe(0);
    expect(io.printed.out).toContain(
      `Registry defaults not compared: the build before (${short(a)}) has no packages/registry-default on disk. Compare registry/ with ${path.join(kingdom, '.builds', b, ...REGISTRY)} by hand.`,
    );
    await writeDefault('prompts/judge.md', await inKingdom('registry/prompts/judge.md'));
    await source.commit({});
    const again = testIo();
    expect(await upgrade(again)).toBe(0);
    expect(again.printed.out).toContain(
      'Registry defaults: nothing the new build changed is left to bring into the kingdom.',
    );
  });
});
