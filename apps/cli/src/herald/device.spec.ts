// `elvaria herald pair|devices|device|revoke` (P2-01b, ADR 0037) without a running Herald: the device files they
// write (the CLI's exception to ADR 0005), the roles' rules they hold before writing, and the pairing file that keeps
// a hash, never the code. No socket, no mana.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { foundKingdom, gitRepo, printed, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

describe('elvaria herald pair, devices, device, revoke', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeAll(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    for (const id of ['north', 'south']) {
      const repo = await gitRepo(path.join(dir.root, `repo ${id}`));
      const io = testIo();
      if ((await run(io, 'territory', 'add', repo, '--id', id, '--kingdom', kingdom)) !== 0)
        throw new Error(printed(io));
    }
  });
  afterAll(() => dir.remove());

  const herald = async (...args: string[]) => {
    const io = testIo();
    const code = await run(io, 'herald', ...args, '--kingdom', kingdom, '--locale', 'en');
    return { code, text: printed(io) };
  };

  const deviceFiles = async () => (await readdir(path.join(kingdom, 'devices'))).sort();
  const deviceFile = async (id: string) =>
    JSON.parse(await readFile(path.join(kingdom, 'devices', `${id}.json`), 'utf8')) as Record<
      string,
      unknown
    >;
  const idIn = (text: string) => /dev_\d{8}_[0-9a-z]{6}/.exec(text)?.[0] ?? '';

  it('refuses a role, a label or territories the device file could not hold, and writes nothing', async () => {
    const before = await deviceFiles();
    const refusals: [string[], number, string][] = [
      [['--role', 'admin', '--label', 'x'], 2, '--role takes one of: full, scoped, inquiry.'],
      [['--role', 'full', '--label', ' '], 2, '--label takes 1 to 64 characters.'],
      [['--role', 'full', '--label', 'x'.repeat(65)], 2, '--label takes 1 to 64 characters.'],
      [['--role', 'full', '--label', 'x', '--territory', 'north'], 2, 'The full role takes no --territory'],
      [['--role', 'scoped', '--label', 'x'], 2, 'The scoped role needs at least one --territory.'],
      [['--role', 'inquiry', '--label', 'x', '--territory', 'west'], 1, 'No territory «west» in the kingdom'],
      [['--role', 'inquiry', '--label', 'x', '--territory', 'Not An Id'], 1, 'No territory «Not An Id»'],
    ];
    for (const [args, exit, line] of refusals) {
      const { code, text } = await herald('pair', ...args);
      expect({ args, code }).toEqual({ args, code: exit });
      expect(text).toContain(line);
    }
    expect(await deviceFiles()).toEqual(before);
  });

  it('pairs a scoped device: its file holds role and territories, the pairing file only a hash', async () => {
    const { code, text } = await herald(
      'pair',
      '--role',
      'scoped',
      '--label',
      ' Work phone ',
      '--territory',
      'south',
      '--territory',
      'north',
      '--territory',
      'south',
    );
    expect(code).toBe(0);
    const id = idIn(text);
    expect(id).toMatch(/^dev_20261106_/);
    expect(text).toContain(`Created the device ${id} «Work phone», role Scoped.`);
    expect(await deviceFile(id)).toEqual({
      version: 1,
      id,
      label: 'Work phone',
      role: 'scoped',
      territories: ['south', 'north'],
      created_at: '2026-11-06T09:00:00+07:00',
    });
    const pairing = await readFile(path.join(kingdom, '.state', 'herald-pairing.json'), 'utf8');
    const secret = /\/pair\?code=([\w-]+)/.exec(text)?.[1] ?? '';
    expect(secret.length).toBeGreaterThanOrEqual(22);
    expect(pairing).toContain(id);
    expect(pairing).not.toContain(secret);
    expect(text).toContain('before 2026-11-06T09:05:00+07:00');
  });

  it('lists devices, shows one, and changes its role, territories and label', async () => {
    const { text } = await herald('pair', '--role', 'inquiry', '--label', 'Tablet', '--territory', 'north');
    const id = idIn(text);
    const shown = await herald('device', id);
    expect(shown.code).toBe(0);
    expect(shown.text).toMatch(
      new RegExp(`${id}\\s+Tablet\\s+Inquiry\\s+north\\s+2026-11-06T09:00:00\\+07:00\\s+—\\s+—`),
    );
    expect((await herald('devices')).text).toContain(id);

    expect((await herald('device', id, '--role', 'scoped')).code).toBe(0);
    expect(await deviceFile(id)).toMatchObject({ role: 'scoped', territories: ['north'] });
    expect((await herald('device', id, '--territory', 'south', '--label', 'Old tablet')).code).toBe(0);
    expect(await deviceFile(id)).toMatchObject({
      role: 'scoped',
      territories: ['south'],
      label: 'Old tablet',
    });
    const full = await herald('device', id, '--role', 'full');
    expect(full.text).toContain(`Saved ${id}`);
    const file = await deviceFile(id);
    expect(file.role).toBe('full');
    expect('territories' in file).toBe(false);
    const limited = await herald('device', id, '--role', 'inquiry');
    expect(limited.code).toBe(2);
    expect(limited.text).toContain('The inquiry role needs at least one --territory.');
    expect((await deviceFile(id)).role).toBe('full');
  });

  it('names a device it does not know', async () => {
    for (const id of ['dev_20261106_zzzzzz', '../kingdom']) {
      const { code, text } = await herald('device', id);
      expect(code).toBe(1);
      expect(text).toContain(`No device «${id}»`);
    }
  });

  it('revokes one device or all, once, and a revoked device takes no change', async () => {
    const first = idIn((await herald('pair', '--role', 'full', '--label', 'One')).text);
    expect((await herald('revoke')).code).toBe(2);
    expect((await herald('revoke', first, '--all')).text).toContain('Name exactly one: <id> or --all.');

    const revoked = await herald('revoke', first);
    expect(revoked.text).toContain(`Revoked ${first} «One».`);
    expect((await deviceFile(first)).revoked_at).toBe('2026-11-06T09:00:00+07:00');
    expect((await herald('revoke', first)).text).toContain(
      `${first} was revoked at 2026-11-06T09:00:00+07:00.`,
    );
    const changed = await herald('device', first, '--label', 'Two');
    expect(changed.code).toBe(1);
    expect(changed.text).toContain('pair a new device instead');
    expect((await deviceFile(first)).label).toBe('One');

    const all = await herald('revoke', '--all');
    expect(all.code).toBe(0);
    const files = await Promise.all(
      (await deviceFiles()).map((file) => deviceFile(path.basename(file, '.json'))),
    );
    expect(files.every((device) => typeof device.revoked_at === 'string')).toBe(true);
    expect((await herald('revoke', '--all')).text).toContain('No device left to revoke.');
  });
});
