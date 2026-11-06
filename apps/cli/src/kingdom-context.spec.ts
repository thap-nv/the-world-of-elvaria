import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../test/cli.ts';
import type { TempDir } from '../test/cli.ts';

describe('opening a kingdom', () => {
  let dir: TempDir;
  beforeEach(async () => {
    dir = await tempDir();
  });
  afterEach(() => dir.remove());

  it('says when a folder is not a kingdom, and how to found one', async () => {
    const io = testIo();
    expect(await run(io, 'territory', 'list', '--kingdom', dir.root, '--locale', 'en')).toBe(1);
    expect(io.printed.err[0]).toContain(`${dir.root} is not a kingdom yet (no kingdom.json)`);
    expect(io.printed.err[0]).toContain('elvaria init --kingdom');
  });

  it('needs a kingdom from --kingdom or ELVARIA_KINGDOM', async () => {
    const io = testIo({ env: {} });
    expect(await run(io, 'quest', 'list')).toBe(1);
    expect(io.printed.err).toEqual([
      'Chưa biết vương quốc nào: thêm --kingdom <thư mục> hoặc đặt biến ELVARIA_KINGDOM.',
    ]);
  });

  it('translates a broken kingdom.json through the store issue code', async () => {
    await writeFile(path.join(dir.root, 'kingdom.json'), '{ not json');
    const io = testIo();
    expect(await run(io, 'quest', 'list', '--kingdom', dir.root, '--locale', 'en')).toBe(1);
    expect(io.printed.err).toEqual(['kingdom.json is not valid JSON.']);
  });

  it('prints schema details under an invalid kingdom.json', async () => {
    await writeFile(path.join(dir.root, 'kingdom.json'), JSON.stringify({ version: 1, name: 'x' }));
    const io = testIo();
    expect(await run(io, 'quest', 'list', '--kingdom', dir.root, '--locale', 'en')).toBe(1);
    expect(io.printed.err[0]).toBe('kingdom.json does not match its schema:');
    expect(io.printed.err.slice(1).join('\n')).toContain('  created_at: ');
  });

  it("speaks the kingdom's language unless --locale says otherwise", async () => {
    const kingdom = await foundKingdom(dir.root, testIo(), '--locale', 'en');
    const own = testIo();
    await run(own, 'quest', 'list', '--kingdom', kingdom);
    expect(printed(own)).toBe('No quests yet.');
    const flag = testIo();
    await run(flag, 'quest', 'list', '--kingdom', kingdom, '--locale', 'vi');
    expect(printed(flag)).toBe('Chưa có nhiệm vụ nào.');
  });
});
