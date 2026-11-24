// `elvaria tribe check` of a second ChatGPT account (PS-27c): the conformance suite runs in the tribe's own Codex home,
// and a pass enables it. The fake Codex notes each call in the home it ran in (fake-calls.jsonl), and takes a home
// holding auth.json as signed in.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baseEnv, foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { editKingdom, kingdomJson } from '../../test/lantern.ts';
import { SELF_ROOT } from '../upgrade/self.ts';
import type { TempDir } from '../../test/cli.ts';

const FAKE_CODEX = path.join(SELF_ROOT, 'packages', 'runner-codex', 'fixtures', 'fake-codex.mjs');
const portable = (file: string) => file.replaceAll('\\', '/');

// Timeout: the test runs the whole conformance suite through the codex adapter, the fake CLI and the hook: each fake
// session is a Node process, one more for its hooks check through the app-server and one per hook call. 15 s on an
// idle Windows machine, against vitest's 30 s here; check-sibling.spec.ts gives Claude's run as much (fix/ci-red).
describe('elvaria tribe check of a second Codex account (PS-27c)', { timeout: 120_000 }, () => {
  let dir: TempDir;
  let kingdom: string;
  let home: string;
  let second: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    home = path.join(dir.root, 'home');
    second = path.join(home, '.elvaria', 'accounts', 'codex_2');
    await mkdir(second, { recursive: true });
    await writeFile(path.join(second, 'auth.json'), '{}');
    await editKingdom(kingdom, (value) => {
      const tool = { path: portable(FAKE_CODEX), version: '0.167.0-alpha.4.1', auth: 'login' };
      return {
        ...value,
        tribes: [
          { id: 'codex', adapter: 'codex_cli', enabled: true, max_concurrent: 1, tool },
          {
            id: 'codex_2',
            adapter: 'codex_cli',
            enabled: false,
            max_concurrent: 1,
            tool: { ...tool, config_dir: portable(second) },
          },
        ],
      };
    });
  });
  afterEach(() => dir.remove());

  it('passes scenarios in its own home without enabling the tribe', async () => {
    const io = testIo({ env: { ...baseEnv(), HOME: home, USERPROFILE: home }, home });
    const args = ['tribe', 'check', 'codex_2', '--scenarios', '--kingdom', kingdom, '--locale', 'en'];
    const code = await run(io, ...args);
    expect(io.printed.err).toEqual([]);
    expect(code).toBe(0);
    const tribes = (await kingdomJson(kingdom)).tribes as { id: string; enabled: boolean }[];
    expect(tribes.find(({ id }) => id === 'codex_2')?.enabled).toBe(false);
    const calls = (await readFile(path.join(second, 'fake-calls.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => (JSON.parse(line) as { call: string }).call);
    // The suite's sessions and the hooks check before each, its probe, and the doctor that closes it all ran there.
    expect(new Set(calls)).toEqual(
      new Set(['exec', 'initialize', 'hooks/list', 'account/rateLimits/read', 'version', 'login']),
    );
  });
});
