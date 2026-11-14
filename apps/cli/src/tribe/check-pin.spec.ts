// `elvaria tribe check` with the real CLI pins the CLI it passed on, for its tribe alone (B1 of the lessons of
// 2026-11-13), that version the checked one the Steward holds the tribe to (A1b); `--scenarios` pins nothing. A failed
// check's workspace is kept in the kingdom, and a session's ceiling is `--timeout`. The lantern fake CLI plays the
// real one here: the suite runs only its live checks against it.
import { access, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import {
  FAKE_LANTERN,
  LANTERN_ADAPTER,
  editKingdom,
  installLantern,
  kingdomJson,
} from '../../test/lantern.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

type Tribes = { id: string; enabled: boolean; tool?: Record<string, unknown> }[];

describe('tribe check with the real CLI pins it for its tribe alone', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await installLantern(kingdom);
    await elvaria(testIo(), 'tribe', 'add', 'lantern', '--adapter', LANTERN_ADAPTER);
    await elvaria(testIo(), 'doctor', '--tool', `lantern=${FAKE_LANTERN}`);
  });
  afterEach(() => dir.remove());

  const elvaria = (io: TestIo, ...args: string[]) => run(io, ...args, '--kingdom', kingdom, '--locale', 'en');
  const tribes = async () => (await kingdomJson(kingdom)).tribes as Tribes;
  const lantern = async () => (await tribes()).find(({ id }) => id === 'lantern');
  /** lantern as an owner finds it after its CLI replaced itself in place: kingdom.json still pins 0.4.1. */
  const pinOld = (more: Record<string, unknown> = {}) =>
    editKingdom(kingdom, (value) => ({
      ...value,
      tribes: (value.tribes as Tribes).map((tribe) =>
        tribe.id === 'lantern' ? { ...tribe, tool: { ...tribe.tool, version: '0.4.1', ...more } } : tribe,
      ),
    }));

  it('pins the version it passed on as checked, and changes no other tribe', async () => {
    await pinOld();
    const others = (await tribes()).filter(({ id }) => id !== 'lantern');
    const io = testIo();
    expect(await elvaria(io, 'tribe', 'check', 'lantern', '--model', 'lantern-small')).toBe(0);
    const portable = FAKE_LANTERN.replaceAll('\\', '/');
    expect(io.printed.out.slice(-2)).toEqual([
      `Tribe lantern: pinned 0.4.2 at ${portable}, the version this check passed on; the other tribes are unchanged.`,
      'Tribe lantern passes the conformance suite and is now enabled in kingdom.json.',
    ]);
    expect(await lantern()).toMatchObject({
      enabled: true,
      tool: { path: portable, version: '0.4.2', checked_version: '0.4.2', auth: 'login' },
    });
    expect((await tribes()).filter(({ id }) => id !== 'lantern')).toEqual(others);
  });

  it('pins nothing with the fake CLI of --scenarios', async () => {
    await pinOld();
    expect(await elvaria(testIo(), 'tribe', 'check', 'lantern', '--scenarios')).toBe(0);
    expect((await lantern())?.tool).toMatchObject({ version: '0.4.1' });
    expect((await lantern())?.tool).not.toHaveProperty('checked_version');
  });

  it('pins the CLI --tool names once the pinned one is gone, path and version (Codex, 2026-11-14)', async () => {
    await pinOld({ path: path.join(dir.root, 'gone', 'lantern.mjs').replaceAll('\\', '/') });
    const moved = path.join(dir.root, 'new lantern.mjs');
    await copyFile(FAKE_LANTERN, moved);
    const io = testIo();
    expect(await elvaria(io, 'tribe', 'check', 'lantern', '--tool', moved, '--model', 'lantern-small')).toBe(
      0,
    );
    expect((await lantern())?.tool).toMatchObject({
      path: moved.replaceAll('\\', '/'),
      version: '0.4.2',
      checked_version: '0.4.2',
    });
  });

  it("keeps a failed check's workspace in the kingdom, and pins nothing", async () => {
    await pinOld();
    // A lantern whose tiny job crashes: `submit` fails on what its session did.
    const crashing = path.join(dir.root, 'crashing lantern.mjs');
    await writeFile(
      crashing,
      [
        "if (process.env.ELVARIA_FAKE_SCENARIO === 'submit') process.env.ELVARIA_FAKE_SCENARIO = 'crash';",
        `await import(${JSON.stringify(pathToFileURL(FAKE_LANTERN).href)});`,
      ].join('\n'),
    );
    const io = testIo();
    expect(
      await elvaria(io, 'tribe', 'check', 'lantern', '--tool', crashing, '--model', 'lantern-small'),
    ).toBe(1);
    const kept = io.printed.err.find((line) => line.startsWith('! submit: '));
    const folder = kept?.replace(/^.* are kept in /, '') ?? '';
    expect(folder).toMatch(/[/\\]\.runs[/\\]tribe-check-lantern-\d{8}T\d{6}[/\\]submit$/);
    await expect(access(path.join(folder, '.runs', 'q_20261107_c0nf0r-1'))).resolves.toBeUndefined();
    expect((await lantern())?.tool).toMatchObject({ version: '0.4.1' });
  });

  it('takes --timeout in whole seconds only', async () => {
    const io = testIo();
    expect(await elvaria(io, 'tribe', 'check', 'lantern', '--timeout', '0')).toBe(2);
    expect(printed(io)).toContain('--timeout 0: give a whole number of seconds from 1.');
    expect(await elvaria(testIo(), 'tribe', 'check', 'lantern', '--scenarios', '--timeout', '30')).toBe(0);
  });
});
