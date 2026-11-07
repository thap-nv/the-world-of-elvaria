// `elvaria doctor` and the tribe options it cannot honour, `--enable`, and the class prompts a kingdom made before
// P1-15 lacks (implementation-plan §11, P1-15): before P1-15, `--acknowledge-terms` for a disabled tribe was
// ignored without a word.
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { KingdomSchema } from '@elvaria/domain';
import { REGISTRY_ROOT } from '@elvaria/registry-default';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  baseEnv,
  fakeTool,
  foundKingdom,
  isolatedPath,
  printed,
  run,
  tempDir,
  testIo,
} from '../../test/cli.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';
import type { Kingdom } from '@elvaria/domain';

describe('elvaria doctor: tribe options and class prompts (P1-15)', () => {
  let dir: TempDir;
  let kingdom: string;
  let bin: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    bin = path.join(dir.root, 'bin');
    await fakeTool(bin, 'claude', '2.1.318 (Claude Code)');
    await fakeTool(bin, 'agy', '1.5.2');
  });
  afterEach(() => dir.remove());

  const readKingdom = async (): Promise<Kingdom> =>
    KingdomSchema.parse(JSON.parse(await readFile(path.join(kingdom, 'kingdom.json'), 'utf8')));
  const writeKingdom = (value: Kingdom) =>
    writeFile(path.join(kingdom, 'kingdom.json'), JSON.stringify(value));
  const doctorIo = async (...dirs: string[]): Promise<TestIo> =>
    testIo({ env: baseEnv(await isolatedPath(...dirs)) });
  const doctor = (io: TestIo, ...args: string[]) =>
    run(io, 'doctor', ...args, '--kingdom', kingdom, '--locale', 'en');

  /** kingdom.json with the gemini tribe turned off, as the owner's kingdom was after P1-11. */
  const disableGemini = async () => {
    const value = await readKingdom();
    const tribes = value.tribes.map((tribe) =>
      tribe.id === 'gemini' ? { ...tribe, enabled: false } : tribe,
    );
    await writeKingdom(KingdomSchema.parse({ ...value, tribes }));
  };

  it('refuses terms for a tribe it skips, and options naming a tribe kingdom.json has not', async () => {
    await disableGemini();
    const before = await readFile(path.join(kingdom, 'kingdom.json'), 'utf8');
    const io = await doctorIo(bin);
    expect(await doctor(io, '--acknowledge-terms', 'gemini')).toBe(2);
    expect(io.printed.err).toEqual([
      '--acknowledge-terms gemini: tribe gemini is disabled, so doctor skips it and would record nothing. Enable it in the same command: elvaria doctor --enable gemini --acknowledge-terms gemini',
    ]);
    expect(io.printed.out).toEqual([]);
    expect(await readFile(path.join(kingdom, 'kingdom.json'), 'utf8')).toBe(before);

    const unknown = await doctorIo(bin);
    expect(
      await doctor(unknown, '--enable', 'gemni', '--tool', 'codex=x', '--acknowledge-terms', 'agy'),
    ).toBe(2);
    expect(unknown.printed.err).toEqual([
      '--tool codex: kingdom.json has no tribe codex (it has: claude, gemini).',
      '--enable gemni: kingdom.json has no tribe gemni (it has: claude, gemini).',
      '--acknowledge-terms agy: kingdom.json has no tribe agy (it has: claude, gemini).',
    ]);
  });

  it('enables a disabled tribe once it finds its CLI; the owner acknowledges its terms after', async () => {
    await disableGemini();
    const claudeOnly = path.join(dir.root, 'claude only');
    await fakeTool(claudeOnly, 'claude', '2.1.318 (Claude Code)');
    const missing = await doctorIo(claudeOnly);
    expect(await doctor(missing, '--enable', 'gemini')).toBe(1);
    expect(printed(missing)).toContain('✗ Tribe gemini: agy was not found on PATH.');
    expect(printed(missing)).toContain('✗ Tribe gemini stays disabled until the problem above is fixed.');
    expect((await readKingdom()).tribes[1]?.enabled).toBe(false);

    const io = await doctorIo(bin);
    expect(await doctor(io, '--enable', 'gemini')).toBe(1);
    expect(printed(io)).toContain('✓ Tribe gemini is now enabled in kingdom.json.');
    expect(printed(io)).toContain("✗ Tribe gemini: Antigravity's terms are not acknowledged");
    expect((await readKingdom()).tribes[1]).toMatchObject({ enabled: true, tool: { version: '1.5.2' } });
    const acknowledged = await doctorIo(bin);
    expect(await doctor(acknowledged, '--acknowledge-terms', 'gemini')).toBe(0);
    expect((await readKingdom()).tribes[1]?.tool?.terms_acknowledged_at).toBe('2026-11-06T09:00:00+07:00');

    // A tribe turned off by hand with its tool still pinned: --enable writes only `enabled`.
    await disableGemini();
    const again = await doctorIo(bin);
    expect(await doctor(again, '--enable', 'gemini', '--acknowledge-terms', 'gemini')).toBe(0);
    expect(printed(again)).toContain('✓ Tribe gemini is now enabled in kingdom.json.');
    expect((await readKingdom()).tribes[1]?.enabled).toBe(true);
  });

  it('names a class prompt the kingdom lacks and where the default ones are', async () => {
    const judge = path.join(kingdom, 'registry', 'prompts', 'judge.md');
    const text = await readFile(judge, 'utf8');
    await rm(judge);
    const io = await doctorIo(bin);
    expect(await doctor(io, '--acknowledge-terms', 'gemini')).toBe(1);
    expect(printed(io)).toContain('✗ The registry does not load:');
    expect(printed(io)).toContain('There is no file registry/prompts/judge.md.');
    expect(printed(io)).toContain(
      `Run elvaria migrate: it copies the missing class prompts from ${path.join(REGISTRY_ROOT, 'prompts')}`,
    );
    // A catalog script only a script-tier quest needs is a warning.
    await writeFile(judge, text);
    await rm(path.join(kingdom, 'registry', 'scripts', 'count-files.mjs'));
    const scripts = await doctorIo(bin);
    expect(await doctor(scripts, '--acknowledge-terms', 'gemini')).toBe(0);
    expect(printed(scripts)).toContain('! The registry names 1 catalog scripts the kingdom does not have:');
    expect(printed(scripts)).toContain('registry/scripts/count-files.mjs');
  });
});
