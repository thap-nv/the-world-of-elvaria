// `elvaria doctor` and two Codex tribes (PS-27c): the rules PS-27 wrote for any adapter that runs its CLI in a folder
// (config-dir.spec.ts) hold for Codex once its adapter declares one. Two login tribes on one home or one account are
// an error for both, and `--enable` leaves the second off; a home of its own enables it. The fake Codex
// (runner-codex's fixtures) names the home it runs in and an account named after it, once the home holds auth.json.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baseEnv, foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { editKingdom, kingdomJson } from '../../test/lantern.ts';
import { SELF_ROOT } from '../upgrade/self.ts';
import type { TempDir } from '../../test/cli.ts';

const FAKE_CODEX = path.join(SELF_ROOT, 'packages', 'runner-codex', 'fixtures', 'fake-codex.mjs');

describe('elvaria doctor with two Codex tribes (PS-27c)', () => {
  let dir: TempDir;
  let kingdom: string;
  let home: string;
  let second: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    home = path.join(dir.root, 'home');
    second = await signedIn(path.join(home, '.elvaria', 'accounts', 'codex_2'));
    await editKingdom(kingdom, (value) => ({
      ...value,
      tribes: [
        { id: 'codex', adapter: 'codex_cli', enabled: true, max_concurrent: 1 },
        { id: 'codex_2', adapter: 'codex_cli', enabled: false, max_concurrent: 1 },
      ],
    }));
  });
  afterEach(() => dir.remove());

  /** A home the owner ran `codex login` in: the fake CLI takes its auth.json for that. */
  async function signedIn(folder: string): Promise<string> {
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'auth.json'), '{}');
    return folder;
  }

  /** doctor with both tribes on the fake CLI, a home of the test's own (Codex's default home lies there). */
  const doctor = async (...args: string[]) => {
    const io = testIo({ env: { ...baseEnv(), HOME: home, USERPROFILE: home }, home });
    const tools = ['--tool', `codex=${FAKE_CODEX}`, '--tool', `codex_2=${FAKE_CODEX}`];
    const code = await run(io, 'doctor', ...tools, ...args, '--kingdom', kingdom, '--locale', 'en');
    return { code, text: printed(io) };
  };
  const enabledOf = async (id: string) =>
    ((await kingdomJson(kingdom)).tribes as { id: string; enabled: boolean }[]).find(
      (tribe) => tribe.id === id,
    )?.enabled;

  it('fails both tribes that name no home: Codex names its default one, and the second stays off', async () => {
    const { code, text } = await doctor('--enable', 'codex_2');
    expect(code).toBe(1);
    const folder = path.join(home, '.codex');
    expect(text).toContain(
      `✗ Tribe codex: its CLI runs in the same config folder as tribe codex_2's (${folder}),`,
    );
    expect(text).toContain('✗ Tribe codex_2 stays disabled until the problem above is fixed.');
    expect(await enabledOf('codex_2')).toBe(false);
  });

  it('fails two tribes in one home, and enables one with a home of its own', async () => {
    const shared = await doctor('--config-dir', `codex=${second}`, '--config-dir', `codex_2=${second}`);
    expect(shared.text).toContain(
      `✗ Tribe codex: its CLI runs in the same config folder as tribe codex_2's (${second}),`,
    );
    const apart = await doctor('--config-dir', 'codex=', '--enable', 'codex_2');
    expect(apart.text).toContain('✓ Tribe codex_2 is now enabled in kingdom.json.');
    expect(await enabledOf('codex_2')).toBe(true);
  });

  it('fails one account signed in to in two homes, without ever naming the account', async () => {
    // The fake CLI's account is its home's name: two homes named codex_2 are one account.
    const twin = await signedIn(path.join(home, 'twin', 'codex_2'));
    const { code, text } = await doctor(
      '--config-dir',
      `codex=${twin}`,
      '--config-dir',
      `codex_2=${second}`,
      '--enable',
      'codex_2',
    );
    expect(code).toBe(1);
    expect(text).toContain(
      "✗ Tribe codex_2: its CLI is signed in to the same account as tribe codex's, in another config folder,",
    );
    expect(text).not.toContain('acct-');
    expect(await enabledOf('codex_2')).toBe(false);
  });

  it('keeps a home nobody signed in to off, and says how to sign in', async () => {
    const fresh = path.join(home, '.elvaria', 'accounts', 'codex_3');
    await mkdir(fresh, { recursive: true });
    const { code, text } = await doctor('--config-dir', `codex_2=${fresh}`, '--enable', 'codex_2');
    expect(code).toBe(1);
    expect(text).toContain('codex login');
    expect(text).not.toContain('same config folder');
    expect(await enabledOf('codex_2')).toBe(false);
  });
});
