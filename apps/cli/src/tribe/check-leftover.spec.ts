// `elvaria tribe check` when the suite cannot remove a check's temp folder (lessons of 2026-11-12, A3): on Windows a
// real agy held it for minutes after the session, and the cleanup turned 3 of `tribe check gemini`'s 7 checks red.
import { access, rm } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as FsPromises from 'node:fs/promises';

// rm stays the real one, except for the suite's workspaces: a real EBUSY needs a process holding the folder, which
// only Windows refuses to delete, and its retries would take 5.5 s for each check.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return { ...actual, rm: vi.fn(actual.rm) };
});

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { FAKE_LANTERN, LANTERN_ADAPTER, installLantern } from '../../test/lantern.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

const { rm: realRm } = await vi.importActual<typeof FsPromises>('node:fs/promises');

describe('elvaria tribe check, with a temp folder that will not go', () => {
  let dir: TempDir;
  let kingdom: string;
  const held: string[] = [];
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await installLantern(kingdom);
    vi.mocked(rm).mockImplementation(async (target, options) => {
      const folder = String(target);
      if (!path.basename(folder).startsWith('elvaria conformance ')) return realRm(target, options);
      held.push(folder);
      throw Object.assign(new Error(`EBUSY: resource busy or locked, rmdir '${folder}'`), { code: 'EBUSY' });
    });
  });
  afterEach(async () => {
    vi.mocked(rm).mockImplementation(realRm);
    await Promise.all(held.splice(0).map((folder) => realRm(folder, { recursive: true, force: true })));
    await dir.remove();
  });

  const elvaria = (io: TestIo, ...args: string[]) => run(io, ...args, '--kingdom', kingdom, '--locale', 'en');

  it('says which folder stays, and the tribe passes on what its sessions did', async () => {
    expect(await elvaria(testIo(), 'tribe', 'add', 'lantern', '--adapter', LANTERN_ADAPTER)).toBe(0);
    await elvaria(testIo(), 'doctor', '--tool', `lantern=${FAKE_LANTERN}`);
    const io = testIo();
    expect(await elvaria(io, 'tribe', 'check', 'lantern', '--scenarios')).toBe(0);
    expect(io.printed.out).toContain('✓ submit');
    expect(io.printed.out.at(-1)).toBe(
      'Tribe lantern passes the conformance suite and is now enabled in kingdom.json.',
    );
    // One line per check that played a session, naming the folder it left.
    expect(io.printed.err).toHaveLength(held.length);
    expect(io.printed.err[0]).toBe(
      `! submit: the check's temp folder would not go (EBUSY: resource busy or locked, rmdir '${held[0]}'): a process of the CLI still holds it. The check does not fail for that; remove the folder once the CLI is done with it: ${held[0]}`,
    );
    expect(io.printed.err.map((line) => /^! (\w+):/.exec(line)?.[1])).toEqual([
      'submit',
      'crash',
      'hang',
      'rate_limit',
      'spawn_child',
      'ask',
    ]);
    await expect(access(held[0] ?? '')).resolves.toBeUndefined();
  });
});
