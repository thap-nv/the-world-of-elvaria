// `elvaria tribe check` of a second Claude Code account (PS-27): the conformance suite runs in the tribe's own config
// folder, and a pass enables it; while it shares a folder with the enabled claude tribe, it stays off whatever the
// suite says. The fake CLI notes each call in the folder it ran in (fake-calls.jsonl).
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baseEnv, foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { editKingdom, kingdomJson } from '../../test/lantern.ts';
import { SELF_ROOT } from '../upgrade/self.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

const FAKE_CLAUDE = path.join(SELF_ROOT, 'packages', 'runner-claude', 'fixtures', 'fake-claude.mjs');
const portable = (file: string) => file.replaceAll('\\', '/');

describe('elvaria tribe check of a second Claude Code account (PS-27)', () => {
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
  });
  afterEach(() => dir.remove());

  /** claude enabled on the CLI's default folder; claude_2 off, in `folder` when one is given. */
  const tribes = (folder?: string) =>
    editKingdom(kingdom, (value) => {
      const tool = { path: portable(FAKE_CLAUDE), version: '2.1.318', auth: 'login' };
      return {
        ...value,
        tribes: [
          { id: 'claude', adapter: 'claude_code', enabled: true, max_concurrent: 1, tool },
          {
            id: 'claude_2',
            adapter: 'claude_code',
            enabled: false,
            max_concurrent: 1,
            tool: folder === undefined ? tool : { ...tool, config_dir: portable(folder) },
          },
        ],
      };
    });
  const check = async (): Promise<{ code: number; io: TestIo }> => {
    const io = testIo({ env: { ...baseEnv(), HOME: home, USERPROFILE: home }, home });
    const code = await run(
      io,
      'tribe',
      'check',
      'claude_2',
      '--scenarios',
      '--kingdom',
      kingdom,
      '--locale',
      'en',
    );
    return { code, io };
  };
  const enabled = async () =>
    ((await kingdomJson(kingdom)).tribes as { id: string; enabled: boolean }[]).find(
      ({ id }) => id === 'claude_2',
    )?.enabled;

  it('passes the suite in its own folder, and is enabled', async () => {
    await tribes(second);
    const { code, io } = await check();
    expect(io.printed.err).toEqual([]);
    expect(code).toBe(0);
    expect(await enabled()).toBe(true);
    const calls = (await readFile(path.join(second, 'fake-calls.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => (JSON.parse(line) as { call: string }).call);
    // The suite's sessions, its probe and the doctor that closes it all ran there.
    expect(new Set(calls)).toEqual(new Set(['session', 'usage', 'ping', 'version', 'auth']));
  });

  it("stays off while it shares the CLI's default folder with the enabled claude tribe", async () => {
    await tribes();
    const { code, io } = await check();
    expect(code).toBe(1);
    expect(io.printed.err).toContain(
      `✗ Tribe claude_2: its CLI runs in the same config folder as tribe claude's (${path.join(home, '.claude')}), so both tribes would spend one account's mana. Give one of them a folder of its own and sign in there once: elvaria doctor --config-dir <tribe>=<folder>.`,
    );
    expect(await enabled()).toBe(false);
  });
});
