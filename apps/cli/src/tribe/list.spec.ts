// How a tribe is turned on and seen (P1-34, implementation-plan §3.14 "không qua thì không bật được"): `doctor
// --enable` refuses an owner adapter file, which only `tribe check` enables, `tribe check` holds the tribe to the login
// its adapter reports as doctor does, and `tribe list` shows every tribe with its adapter, pinned CLI, sign-in and
// limits: a built-in one, an adapter file, and one whose adapter has no runner.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import {
  FAKE_LANTERN,
  LANTERN_ADAPTER,
  editKingdom,
  installLantern,
  kingdomJson,
  writeAdapter,
} from '../../test/lantern.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

describe('elvaria tribe list, and doctor --enable of an adapter file', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await installLantern(kingdom);
    await run(testIo(), 'tribe', 'add', 'lantern', '--adapter', LANTERN_ADAPTER, '--kingdom', kingdom);
    await run(testIo(), 'doctor', '--tool', `lantern=${FAKE_LANTERN}`, '--kingdom', kingdom);
  });
  afterEach(() => dir.remove());

  const elvaria = (io: TestIo, ...args: string[]) => run(io, ...args, '--kingdom', kingdom, '--locale', 'en');

  it('refuses --enable for an adapter file, writes nothing, and points to tribe check', async () => {
    const before = await readFile(path.join(kingdom, 'kingdom.json'), 'utf8');
    const io = testIo();
    expect(await elvaria(io, 'doctor', '--enable', 'lantern', '--enable', 'gemini')).toBe(2);
    expect(io.printed.err).toEqual([
      '--enable lantern: the adapter of tribe lantern is a file of yours (adapters/lantern.mjs) that has passed no conformance suite yet. Run elvaria tribe check lantern: it runs the suite and enables the tribe once it passes.',
    ]);
    expect(io.printed.out).toEqual([]);
    expect(await readFile(path.join(kingdom, 'kingdom.json'), 'utf8')).toBe(before);
  });

  it('tribe check keeps off a tribe whose adapter says its CLI cannot sign in, as doctor does', async () => {
    // lantern, but its doctor() reports no login and no reason: the suite still passes.
    const lantern = pathToFileURL(path.join(kingdom, LANTERN_ADAPTER)).href;
    const locked = await writeAdapter(
      kingdom,
      'locked',
      [
        `import { createAdapter as lantern } from ${JSON.stringify(lantern)};`,
        'export function createAdapter(kit) {',
        '  const runner = lantern(kit);',
        '  return { ...runner, doctor: async () => ({ ...(await runner.doctor()), auth_ok: false }) };',
        '}',
        '',
      ].join('\n'),
    );
    await elvaria(testIo(), 'tribe', 'add', 'locked', '--adapter', locked);
    const pinned = testIo();
    expect(await elvaria(pinned, 'doctor', '--tool', `locked=${FAKE_LANTERN}`)).toBe(1);
    const line = '✗ Tribe locked: its adapter says the CLI cannot sign in, without saying why.';
    expect(pinned.printed.out).toContain(line);
    const io = testIo();
    expect(await elvaria(io, 'tribe', 'check', 'locked', '--scenarios')).toBe(1);
    expect(io.printed.out).toContain('✓ doctor');
    expect(io.printed.err).toEqual([line, 'Tribe locked does not pass, so it stays disabled.']);
    const tribes = (await kingdomJson(kingdom)).tribes as { id: string; enabled: boolean }[];
    expect(tribes.find(({ id }) => id === 'locked')?.enabled).toBe(false);
  });

  it('prints one line per tribe: built in, adapter file, no runner yet, adapter file that does not load', async () => {
    const broken = await writeAdapter(kingdom, 'broken', 'export const createAdapter = 1;\n');
    await editKingdom(kingdom, (value) => ({
      ...value,
      tribes: [
        ...(value.tribes as object[]),
        { id: 'codex', adapter: 'codex_cli', enabled: false, max_concurrent: 1 },
        { id: 'broken', adapter: broken, enabled: false, max_concurrent: 1 },
      ],
    }));
    const io = testIo();
    expect(await elvaria(io, 'tribe', 'list')).toBe(0);
    const lantern = FAKE_LANTERN.replaceAll('\\', '/');
    const cells = io.printed.out.map((line) => line.split(/ {2,}/));
    expect(cells).toEqual([
      ['ID', 'Adapter', 'Enabled', 'Version', 'Sign-in', 'Max rank', 'Guarded', 'Capabilities', 'Path'],
      [
        'claude',
        'claude_code',
        'yes',
        '—',
        '—',
        'S',
        'yes',
        'headless, context_file, events, tool_gate, usage, structured_output, resume, compact, subagent',
        '—',
      ],
      [
        'gemini',
        'antigravity',
        'yes',
        '—',
        '—',
        'S',
        'yes',
        'headless, context_file, events, tool_gate, usage, structured_output, resume',
        '—',
      ],
      [
        'lantern',
        LANTERN_ADAPTER,
        'no',
        '0.4.2',
        'login',
        'D',
        'no',
        // lantern has no JSON Schema flag since P1-33: its judges answer in text.
        'headless, usage',
        lantern,
      ],
      ['codex', 'codex_cli', 'no', '—', '—', '—', '—', 'no runner yet', '—'],
      [
        'broken',
        broken,
        'no',
        '—',
        '—',
        '—',
        '—',
        'adapter file does not load: elvaria tribe check broken',
        '—',
      ],
    ]);
    expect(io.printed.err).toEqual([]);
  });
});
