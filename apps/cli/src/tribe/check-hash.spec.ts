import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { KingdomSchema } from '@elvaria/domain';
import { runConformance } from '@elvaria/runner-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import {
  FAKE_LANTERN,
  LANTERN_ADAPTER,
  editKingdom,
  installLantern,
  kingdomJson,
} from '../../test/lantern.ts';
import { handOf } from '../run/crew.ts';
import type { TempDir } from '../../test/cli.ts';
import type * as RunnerCore from '@elvaria/runner-core';

vi.mock('@elvaria/runner-core', async (importOriginal) => ({
  ...(await importOriginal<typeof RunnerCore>()),
  runConformance: vi.fn(() => Promise.resolve([{ id: 'doctor', outcome: 'passed', tokens: 0 }])),
}));

describe('tribe check pins the adapter bytes it checked (SEC-03)', () => {
  let dir: TempDir;
  let root: string;
  const check = (...args: string[]) =>
    run(testIo(), 'tribe', 'check', 'lantern', ...args, '--kingdom', root, '--locale', 'en');
  const saved = async () => KingdomSchema.parse(await kingdomJson(root));
  const adapter = () => path.join(root, LANTERN_ADAPTER);
  const hash = async () =>
    createHash('sha256')
      .update(await readFile(adapter()))
      .digest('hex');
  beforeEach(async () => {
    vi.mocked(runConformance).mockResolvedValue([{ id: 'doctor', outcome: 'passed', tokens: 0 }]);
    dir = await tempDir();
    root = await foundKingdom(dir.root);
    await installLantern(root);
    await editKingdom(root, (value) => ({
      ...value,
      tribes: [
        {
          id: 'lantern',
          adapter: LANTERN_ADAPTER,
          enabled: false,
          max_concurrent: 1,
          tool: { path: FAKE_LANTERN.replaceAll('\\', '/'), version: '0.4.2' },
        },
      ],
    }));
  });
  afterEach(() => dir.remove());

  it('pins on first success, refuses edits in doctor and run, and repins a successful recheck', async () => {
    const original = await hash();
    expect(await check('--model', 'lantern-small')).toBe(0);
    expect((await saved()).tribes[0]).toMatchObject({ enabled: true, adapter_sha256: original });
    const source = await readFile(adapter(), 'utf8');
    await writeFile(adapter(), source.replace('usage: true', 'usage: false'));
    const changed = await hash();
    const io = testIo();
    expect(await run(io, 'doctor', '--kingdom', root, '--locale', 'en')).toBe(1);
    expect(printed(io)).toContain('elvaria tribe check lantern');
    const blocked = testIo();
    await run(blocked, 'run', '--kingdom', root, '--locale', 'en');
    expect(printed(blocked)).toContain('elvaria tribe check lantern');
    expect(await check('--model', 'lantern-small')).toBe(0);
    const kingdom = await saved();
    expect(kingdom.tribes[0]).toMatchObject({ enabled: true, adapter_sha256: changed });
    const tribe = kingdom.tribes[0];
    if (tribe === undefined) throw new Error('missing tribe');
    const found = await handOf(tribe, { kingdom, root }, testIo());
    expect(found.kind).toBe('ready');
    if (found.kind === 'ready') expect(found.hand.runner.capabilities.usage).toBe(false);
  });

  it('leaves kingdom.json unchanged for --scenarios and --tool', async () => {
    const file = path.join(root, 'kingdom.json');
    const before = await readFile(file, 'utf8');
    expect(await check('--scenarios')).toBe(0);
    expect(await readFile(file, 'utf8')).toBe(before);
    expect(await check('--tool', FAKE_LANTERN, '--model', 'lantern-small')).toBe(0);
    expect(await readFile(file, 'utf8')).toBe(before);
  });

  it('does not enable or replace the pin after a failed suite', async () => {
    vi.mocked(runConformance).mockResolvedValue([
      { id: 'doctor', outcome: 'failed', problem: 'rejected', tokens: 0 },
    ]);
    const before = await saved();
    expect(await check('--model', 'lantern-small')).toBe(1);
    expect(await saved()).toEqual(before);
  });
});
