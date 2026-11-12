// `elvaria tribe add | check | disable` with an owner adapter file whose CLI is fake (implementation-plan §3.14,
// P1-19): the file passes the conformance suite, the tribe is narrowed to ranks F–D, and adding it changes no
// character file.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { KingdomSchema } from '@elvaria/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import {
  FAKE_LANTERN,
  LANTERN_ADAPTER,
  editKingdom,
  installLantern,
  kingdomJson,
  writeAdapter,
} from '../../test/lantern.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

describe('elvaria tribe', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await installLantern(kingdom);
  });
  afterEach(() => dir.remove());

  const elvaria = (io: TestIo, ...args: string[]) => run(io, ...args, '--kingdom', kingdom, '--locale', 'en');
  const tribes = async () => KingdomSchema.parse(await kingdomJson(kingdom)).tribes;
  const lantern = async () => (await tribes()).find(({ id }) => id === 'lantern');
  /** The owner edits kingdom.json: lantern signs in with a paid key, which its adapter does not run with. */
  const payWithKey = () =>
    editKingdom(kingdom, (value) => ({
      ...value,
      tribes: (value.tribes as Record<string, unknown>[]).map((tribe) =>
        tribe.id === 'lantern'
          ? { ...tribe, tool: { ...(tribe.tool as object), auth: 'api_key' }, budget: { usd_week: 5 } }
          : tribe,
      ),
    }));
  /** Adds lantern and pins its CLI, as §3.14 step 1 says: `tribe add`, then `doctor --tool`. */
  const addLantern = async () => {
    expect(await elvaria(testIo(), 'tribe', 'add', 'lantern', '--adapter', LANTERN_ADAPTER)).toBe(0);
    await elvaria(testIo(), 'doctor', '--tool', `lantern=${FAKE_LANTERN}`);
  };

  describe('add', () => {
    it('adds a disabled tribe and changes no character file', async () => {
      await elvaria(testIo(), 'character', 'add', 'thorn', '--class', 'knight');
      const characters = path.join(kingdom, 'characters', 'thorn', 'character.json');
      const before = await readFile(characters, 'utf8');
      const io = testIo();
      expect(
        await elvaria(io, 'tribe', 'add', 'lantern', '--adapter', LANTERN_ADAPTER, '--max-concurrent', '2'),
      ).toBe(0);
      expect(io.printed.out).toEqual([
        'Tribe lantern added (adapter adapters/lantern.mjs), disabled for now.',
        expect.stringContaining('elvaria tribe check lantern') as string,
      ]);
      expect(await lantern()).toEqual({
        id: 'lantern',
        adapter: LANTERN_ADAPTER,
        enabled: false,
        max_concurrent: 2,
      });
      expect((await tribes()).map(({ id }) => id)).toEqual(['claude', 'gemini', 'lantern']);
      expect(await readFile(characters, 'utf8')).toBe(before);
      expect(await readdir(path.join(kingdom, 'characters'))).toEqual(['thorn']);
    });

    it('refuses an id taken, an adapter that is not there, and a malformed line', async () => {
      const refused = async (code: number, ...args: string[]) => {
        const io = testIo();
        expect(await elvaria(io, 'tribe', 'add', ...args)).toBe(code);
        return io.printed.err.join('\n');
      };
      expect(await refused(1, 'claude', '--adapter', 'claude_code')).toBe(
        'The kingdom already has a tribe claude.',
      );
      expect(await refused(1, 'codex', '--adapter', 'codex_exec')).toContain(
        'There is no built-in adapter codex_exec',
      );
      expect(await refused(1, 'mine', '--adapter', 'adapters/mine.mjs')).toContain('does not exist');
      expect(await refused(2, 'Lantern', '--adapter', LANTERN_ADAPTER)).toContain(
        'Lantern is not a tribe id',
      );
      expect(await refused(2, 'x', '--adapter', '../x.mjs')).toContain('is not valid');
      expect(await refused(2, 'x', '--adapter', LANTERN_ADAPTER, '--max-concurrent', '0')).toContain(
        'is not valid',
      );
      expect((await tribes()).map(({ id }) => id)).toEqual(['claude', 'gemini']);
    });
  });

  describe('doctor with an adapter file', () => {
    it('pins the CLI the file names, with the sign-in it declares, and leaves the tribe disabled', async () => {
      await addLantern();
      expect((await lantern())?.tool).toEqual({
        path: FAKE_LANTERN.replaceAll('\\', '/'),
        version: '0.4.2',
        auth: 'login',
      });
      expect((await lantern())?.enabled).toBe(false);
    });

    it('says what is wrong with an adapter file that does not load or cannot find its CLI', async () => {
      const broken = await writeAdapter(kingdom, 'broken', 'export const createAdapter = 1;\n');
      await editKingdom(kingdom, (value) => ({
        ...value,
        tribes: [
          ...(value.tribes as object[]),
          { id: 'broken', adapter: broken, enabled: true, max_concurrent: 1 },
        ],
      }));
      await elvaria(testIo(), 'tribe', 'add', 'lantern', '--adapter', LANTERN_ADAPTER);
      const io = testIo();
      expect(await elvaria(io, 'doctor', '--tool', 'lantern=' + path.join(kingdom, 'nothing'))).toBe(1);
      expect(printed(io)).toContain('✗ Tribe broken: the adapter file adapters/broken.mjs does not load');
      expect(printed(io)).toContain('the file does not export a function createAdapter');
      expect(printed(io)).toContain('✗ Tribe lantern: the path given to --tool is not a file');
      // Turned on by hand before doctor pinned anything.
      await editKingdom(kingdom, (value) => ({
        ...value,
        tribes: (value.tribes as Record<string, unknown>[]).map((tribe) =>
          tribe.id === 'lantern' ? { ...tribe, enabled: true } : tribe,
        ),
      }));
      const unpinned = testIo();
      await elvaria(unpinned, 'doctor');
      expect(printed(unpinned)).toContain(
        '✗ Tribe lantern: the adapter file cannot find or run its CLI: tribe lantern: lantern is not pinned',
      );
    });

    it('refuses a pinned sign-in the adapter does not run with (checkTribeAuth)', async () => {
      await addLantern();
      await payWithKey();
      const io = testIo();
      expect(await elvaria(io, 'doctor', '--tool', `lantern=${FAKE_LANTERN}`)).toBe(1);
      expect(printed(io)).toContain(
        '✗ Tribe lantern: adapter adapters/lantern.mjs runs with login, not api_key. Set tribes[].tool.auth in kingdom.json to one of them.',
      );
      const check = testIo();
      expect(await elvaria(check, 'tribe', 'check', 'lantern', '--scenarios')).toBe(1);
      expect(printed(check)).toContain('runs with login, not api_key');
      expect(printed(check)).toContain('Tribe lantern does not pass, so it stays disabled.');
      expect((await lantern())?.enabled).toBe(false);
    });
  });

  describe('check', () => {
    it('runs the conformance suite against the adapter file, narrows the tribe to F–D, and enables it', async () => {
      await addLantern();
      const io = testIo();
      expect(await elvaria(io, 'tribe', 'check', 'lantern', '--scenarios')).toBe(0);
      expect(io.printed.out).toEqual([
        'Tribe lantern (adapters/lantern.mjs) declares: headless, usage; sign-in: login.',
        'It lacks: context_file, events, tool_gate, structured_output, resume, compact, subagent.',
        'It declares no shell, so its prompt names none.',
        'It takes quests of rank F to D.',
        'Without a tool gate it takes no quest on a territory with read_before_write or rank_floor laws.',
        '✓ capabilities',
        '✓ doctor',
        '✓ probe',
        '✓ submit',
        '✓ crash',
        '✓ hang',
        '✓ rate_limit',
        '– forbidden_command (skipped: the adapter does not declare it)',
        '– scratch_commit (skipped: the adapter does not declare it)',
        '✓ ask',
        'Tribe lantern passes the conformance suite and is now enabled in kingdom.json.',
      ]);
      expect((await lantern())?.enabled).toBe(true);
      const again = testIo();
      expect(await elvaria(again, 'tribe', 'check', 'lantern', '--scenarios')).toBe(0);
      expect(again.printed.out.at(-1)).toBe('Tribe lantern passes the conformance suite.');
    });

    it('runs only the checks that burn no or almost no mana unless the CLI is a fake one', async () => {
      await addLantern();
      const io = testIo();
      expect(await elvaria(io, 'tribe', 'check', 'lantern', '--model', 'lantern-small')).toBe(0);
      expect(io.printed.out.filter((line) => /^[✓✗–] /.test(line))).toEqual([
        '✓ capabilities',
        '✓ doctor',
        '✓ probe',
        '✓ submit',
        '✓ hang',
        '– forbidden_command (skipped: the adapter does not declare it)',
      ]);
      expect((await lantern())?.enabled).toBe(true);
    });

    it('enables nothing before doctor has pinned the CLI', async () => {
      await elvaria(testIo(), 'tribe', 'add', 'lantern', '--adapter', LANTERN_ADAPTER);
      // Without a pinned path the file cannot find its CLI: doctor, probe and every session fail.
      const io = testIo();
      expect(await elvaria(io, 'tribe', 'check', 'lantern', '--scenarios')).toBe(1);
      expect(printed(io)).toContain('✗ doctor: tribe lantern: lantern is not pinned');
      expect((await lantern())?.enabled).toBe(false);
    });

    it('tells a tribe whose adapter file is broken, or has no runner yet, from one that fails', async () => {
      const liar = await writeAdapter(
        kingdom,
        'liar',
        'export const createAdapter = (kit) => ({ tribe: "someone", adapter: kit.tribe.adapter });\n',
      );
      await elvaria(testIo(), 'tribe', 'add', 'liar', '--adapter', liar);
      const io = testIo();
      expect(await elvaria(io, 'tribe', 'check', 'liar')).toBe(1);
      expect(io.printed.err).toEqual([
        'Tribe liar: adapter file adapters/liar.mjs does not load, or what it builds does not keep the contract:',
        '    runner.tribe is someone, not liar (kit.tribe.id)',
        '    capabilities is not an object',
        '    runner.spawn is not a function',
        '    runner.probe is not a function',
        '    runner.doctor is not a function',
      ]);
      await elvaria(testIo(), 'tribe', 'add', 'fallback', '--adapter', 'gemini_cli');
      const none = testIo();
      expect(await elvaria(none, 'tribe', 'check', 'fallback')).toBe(1);
      expect(none.printed.err).toEqual([
        'Tribe fallback: adapter gemini_cli has no runner yet, so there is nothing to check.',
      ]);
      const unknown = testIo();
      expect(await elvaria(unknown, 'tribe', 'check', 'nobody')).toBe(1);
      expect(unknown.printed.err).toEqual([
        'The kingdom has no tribe nobody. Tribes: claude, gemini, liar, fallback.',
      ]);
    });

    it('lets `run` go on without a tribe whose adapter file does not load, and says why', async () => {
      const typo = await writeAdapter(kingdom, 'typo', 'export const createAdapter = ;\n');
      // The kit's launchOf is the CLI's own: a plain file starts as it is, a Windows npm shim with node.
      const shy = await writeAdapter(
        kingdom,
        'shy',
        [
          'export async function createAdapter(kit) {',
          '  const launch = await kit.launchOf(kit.node_path);',
          '  throw new Error(`no lantern here (${String(launch.file === kit.node_path)})`);',
          '}',
          '',
        ].join('\n'),
      );
      await editKingdom(kingdom, (value) => ({
        ...value,
        tribes: [
          { id: 'typo', adapter: typo, enabled: true, max_concurrent: 1 },
          { id: 'shy', adapter: shy, enabled: true, max_concurrent: 1 },
        ],
      }));
      const io = testIo();
      expect(await elvaria(io, 'run')).toBe(0);
      expect(io.printed.err).toEqual([
        'Tribe typo: adapter file adapters/typo.mjs does not load, so this tribe takes no quest:',
        // Node says SyntaxError on one line; vitest's loader says it over several.
        expect.stringMatching(/typo\.mjs: [\s\S]*Unexpected token/) as string,
        'Tribe shy: adapter file adapters/shy.mjs does not load, so this tribe takes no quest:',
        '    createAdapter(kit) threw: no lantern here (true)',
      ]);
    });

    it('keeps an enabled tribe that fails enabled, and says how to stop it', async () => {
      await addLantern();
      await elvaria(testIo(), 'tribe', 'check', 'lantern', '--scenarios');
      await payWithKey();
      const io = testIo();
      expect(await elvaria(io, 'tribe', 'check', 'lantern')).toBe(1);
      expect(io.printed.err.at(-1)).toBe(
        'Tribe lantern does not pass. It is still enabled; elvaria tribe disable lantern stops it taking new work.',
      );
      expect((await lantern())?.enabled).toBe(true);
    });
  });

  describe('disable', () => {
    it('turns a tribe off and says what becomes of its quests', async () => {
      const io = testIo();
      expect(await elvaria(io, 'tribe', 'disable', 'gemini')).toBe(0);
      expect(io.printed.out).toEqual([
        expect.stringMatching(/^Tribe gemini is disabled: it takes no new work/) as string,
      ]);
      expect((await tribes()).map(({ id, enabled }) => [id, enabled])).toEqual([
        ['claude', true],
        ['gemini', false],
      ]);
      const again = testIo();
      expect(await elvaria(again, 'tribe', 'disable', 'gemini')).toBe(0);
      expect(again.printed.out).toEqual(['Tribe gemini is already disabled.']);
      expect(await elvaria(testIo(), 'tribe', 'disable', 'nobody')).toBe(1);
    });
  });
});
