// `elvaria doctor --config-dir` and two tribes of one CLI (PS-27): the folder is pinned into `tool.config_dir` and
// kept by a later `--pin`; a folder that is relative, missing, or inside the kingdom or a territory is refused before
// anything runs; two login tribes of one adapter on one folder or one account are an error for both, and `--enable`
// leaves them off; an adapter that does not run its CLI in a folder is refused one. The fake Claude Code
// (runner-claude's fixtures) reports the folder it runs in and an account named after it.
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baseEnv, fakeTool, foundKingdom, gitRepo, printed, run, tempDir, testIo } from '../../test/cli.ts';
import {
  FAKE_LANTERN,
  LANTERN_ADAPTER,
  editKingdom,
  installLantern,
  kingdomJson,
} from '../../test/lantern.ts';
import { SELF_ROOT } from '../upgrade/self.ts';
import type { TempDir } from '../../test/cli.ts';

const FAKE_CLAUDE = path.join(SELF_ROOT, 'packages', 'runner-claude', 'fixtures', 'fake-claude.mjs');
const portable = (dir: string) => dir.replaceAll('\\', '/');

interface ToolOf {
  readonly config_dir?: string;
}

describe('elvaria doctor --config-dir (PS-27)', () => {
  let dir: TempDir;
  let kingdom: string;
  let home: string;
  let second: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    home = path.join(dir.root, 'home');
    second = path.join(home, '.elvaria', 'accounts', 'claude_2');
    await mkdir(second, { recursive: true });
    await editKingdom(kingdom, (value) => ({
      ...value,
      tribes: [
        { id: 'claude', adapter: 'claude_code', enabled: true, max_concurrent: 1 },
        { id: 'claude_2', adapter: 'claude_code', enabled: false, max_concurrent: 1 },
      ],
    }));
  });
  afterEach(() => dir.remove());

  /** doctor with both tribes on the fake CLI, a home of the test's own (the CLI's default folder lies there). */
  const doctor = async (...args: string[]) => {
    const io = testIo({ env: { ...baseEnv(), HOME: home, USERPROFILE: home }, home });
    const tools = ['--tool', `claude=${FAKE_CLAUDE}`, '--tool', `claude_2=${FAKE_CLAUDE}`];
    const code = await run(io, 'doctor', ...tools, ...args, '--kingdom', kingdom, '--locale', 'en');
    return { code, io, text: printed(io) };
  };
  const toolOf = async (id: string): Promise<ToolOf | undefined> => {
    const tribes = (await kingdomJson(kingdom)).tribes as { id: string; enabled: boolean; tool?: ToolOf }[];
    return tribes.find((tribe) => tribe.id === id)?.tool;
  };
  const enabledOf = async (id: string) =>
    ((await kingdomJson(kingdom)).tribes as { id: string; enabled: boolean }[]).find(
      (tribe) => tribe.id === id,
    )?.enabled;

  it('pins the folder, keeps it on a later --pin, and drops it for an empty one', async () => {
    const pinned = await doctor('--config-dir', `claude_2=${second}`);
    expect(pinned.text).not.toContain('✗ Tribe claude');
    expect((await toolOf('claude_2'))?.config_dir).toBe(portable(second));
    expect((await toolOf('claude'))?.config_dir).toBeUndefined();
    await doctor('--pin');
    expect((await toolOf('claude_2'))?.config_dir).toBe(portable(second));
    await doctor('--config-dir', 'claude_2=');
    expect(await toolOf('claude_2')).not.toHaveProperty('config_dir');
  });

  it('refuses a folder that is relative, missing, or the characters reach, before anything runs', async () => {
    const before = await readFile(path.join(kingdom, 'kingdom.json'), 'utf8');
    const repo = await gitRepo(path.join(dir.root, 'repo'));
    await run(testIo(), 'territory', 'add', repo, '--id', 'land', '--kingdom', kingdom);
    const inKingdom = path.join(kingdom, 'accounts', 'claude_2');
    const inRepo = path.join(repo, 'accounts');
    await Promise.all([mkdir(inKingdom, { recursive: true }), mkdir(inRepo, { recursive: true })]);
    const refused = async (value: string) => {
      const { code, io } = await doctor('--config-dir', value);
      expect(code).toBe(2);
      expect(io.printed.out).toEqual([]);
      return io.printed.err;
    };
    expect(await refused(`nobody=${second}`)).toEqual([
      '--config-dir nobody: kingdom.json has no tribe nobody (it has: claude, claude_2).',
    ]);
    expect(await refused('claude_2=accounts/claude_2')).toEqual([
      '--config-dir claude_2=accounts/claude_2: the folder must be an absolute path.',
    ]);
    const missing = path.join(home, 'nowhere');
    expect((await refused(`claude_2=${missing}`))[0]).toContain(
      `--config-dir claude_2=${missing}: no such folder.`,
    );
    expect((await refused(`claude_2=${inKingdom}`))[0]).toContain(
      `Tribe claude_2: the config folder ${inKingdom} lies inside the kingdom (${kingdom}).`,
    );
    expect((await refused(`claude_2=${inRepo}`))[0]).toContain(
      // The territory's folder as territory add stored it (macOS: the temp folder's real path).
      `Tribe claude_2: the config folder ${inRepo} lies inside territory land (`,
    );
    expect(await refused('claude_2')).toEqual([
      '--config-dir takes <tribe>=<folder>, e.g. claude_2=C:/Users/you/.elvaria/accounts/claude_2; an empty folder (claude_2=) removes it.',
    ]);
    expect(await readFile(path.join(kingdom, 'kingdom.json'), 'utf8')).toBe(before);
  });

  it('fails both tribes that name no folder, and keeps the second off', async () => {
    const { code, text } = await doctor('--enable', 'claude_2');
    expect(code).toBe(1);
    // Claude Code names the folder it runs in, the default one here: the message says which.
    const folder = path.join(home, '.claude');
    expect(text).toContain(
      `✗ Tribe claude: its CLI runs in the same config folder as tribe claude_2's (${folder}),`,
    );
    expect(text).toContain(
      `✗ Tribe claude_2: its CLI runs in the same config folder as tribe claude's (${folder}),`,
    );
    expect(text).toContain('✗ Tribe claude_2 stays disabled until the problem above is fixed.');
    expect(await enabledOf('claude_2')).toBe(false);
  });

  it('fails two tribes in one folder, naming it, and enables one with a folder of its own', async () => {
    const shared = await doctor('--config-dir', `claude=${second}`, '--config-dir', `claude_2=${second}`);
    expect(shared.text).toContain(
      `✗ Tribe claude: its CLI runs in the same config folder as tribe claude_2's (${second}),`,
    );
    const apart = await doctor('--config-dir', 'claude=', '--enable', 'claude_2');
    expect(apart.text).toContain('✓ Tribe claude_2 is now enabled in kingdom.json.');
    expect(await enabledOf('claude_2')).toBe(true);
  });

  it('fails one account signed in to in two folders, without ever naming the account', async () => {
    // The fake CLI's account is its folder's name: two folders named claude_2 are one account.
    const twin = path.join(home, 'twin', 'claude_2');
    await mkdir(twin, { recursive: true });
    const { code, text } = await doctor(
      '--config-dir',
      `claude=${twin}`,
      '--config-dir',
      `claude_2=${second}`,
      '--enable',
      'claude_2',
    );
    expect(code).toBe(1);
    expect(text).toContain(
      "✗ Tribe claude_2: its CLI is signed in to the same account as tribe claude's, in another config folder,",
    );
    expect(text).not.toContain('@example.com');
    expect(await enabledOf('claude_2')).toBe(false);
  });

  it('fails two tribes of an adapter that names no folder, both on its default one', async () => {
    await installLantern(kingdom);
    const adapterSha256 = createHash('sha256')
      .update(await readFile(path.join(kingdom, LANTERN_ADAPTER)))
      .digest('hex');
    const lantern = (id: string) => ({
      id,
      adapter: LANTERN_ADAPTER,
      enabled: true,
      max_concurrent: 1,
      adapter_sha256: adapterSha256,
    });
    await editKingdom(kingdom, (value) => ({ ...value, tribes: [lantern('lantern'), lantern('lantern_2')] }));
    const io = testIo({ env: { ...baseEnv(), HOME: home, USERPROFILE: home }, home });
    const tools = ['--tool', `lantern=${FAKE_LANTERN}`, '--tool', `lantern_2=${FAKE_LANTERN}`];
    expect(await run(io, 'doctor', ...tools, '--kingdom', kingdom, '--locale', 'en')).toBe(1);
    expect(printed(io)).toContain(
      "✗ Tribe lantern_2: like tribe lantern, it names no config folder, so both run adapters/lantern.mjs in the CLI's default folder",
    );
  });

  it('refuses a folder to a tribe whose adapter does not run its CLI in one', async () => {
    const bin = path.join(dir.root, 'bin');
    const agy = await fakeTool(bin, 'agy', '1.5.2');
    await editKingdom(kingdom, (value) => ({
      ...value,
      tribes: [
        ...(value.tribes as object[]),
        { id: 'gemini_2', adapter: 'antigravity', enabled: false, max_concurrent: 1 },
      ],
    }));
    const { text } = await doctor('--tool', `gemini_2=${agy}`, '--config-dir', `gemini_2=${second}`);
    expect(text).toContain(
      `✗ Tribe gemini_2: kingdom.json names a config folder (${portable(second)}), but adapter antigravity does not run its CLI in one,`,
    );
  });
});
