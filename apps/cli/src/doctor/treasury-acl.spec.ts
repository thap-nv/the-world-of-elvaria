import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { translator } from '@elvaria/i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { aclReaders, extraAclReaders, readTreasuryAcl, treasuryAclFindings } from './treasury-acl.ts';

const file = 'C:\\owner home\\treasury.json';
const t = translator('en');

afterEach(() => vi.restoreAllMocks());

describe('treasury ACL parsing', () => {
  it('accepts the current account, SYSTEM and Administrators with inherited full control', () => {
    const output =
      `${file} MACHINE\\Owner:(OI)(CI)(I)(F)\r\n` +
      '    NT AUTHORITY\\SYSTEM:(I)(F)\r\n    BUILTIN\\Administrators:(F)\r\n' +
      'Successfully processed 1 files; Failed processing 0 files';
    expect(aclReaders(output, file)).toEqual([
      'MACHINE\\Owner',
      'NT AUTHORITY\\SYSTEM',
      'BUILTIN\\Administrators',
    ]);
    expect(extraAclReaders(aclReaders(output, file), 'machine\\owner')).toEqual([]);
  });

  it.each(['F', 'M', 'RX', 'R', 'GR', 'GA', 'RD', 'RD,WD,REA,WEA,RA,WA'])(
    'detects %s read access',
    (right) => {
      expect(aclReaders(`${file} Everyone:(${right})`, file)).toEqual(['Everyone']);
    },
  );

  it('warns about Users and Everyone but ignores deny, write-only and inherit-only entries', () => {
    const output =
      `${file} BUILTIN\\Users:(I)(RX)\n` +
      '    Everyone:(R)\n    DOMAIN\\denied:(DENY)(R)\n' +
      '    DOMAIN\\writer:(W)\n    DOMAIN\\children:(OI)(CI)(IO)(F)\n';
    const accounts = extraAclReaders(aclReaders(output, file), 'DOMAIN\\owner');
    expect(accounts).toEqual(['BUILTIN\\Users', 'Everyone']);
    expect(treasuryAclFindings(t, file, accounts)).toEqual([
      {
        level: 'warn',
        text: `Treasury ${file}: other accounts have read access: BUILTIN\\Users, Everyone.`,
        details: [expect.stringContaining('Disable inheritance')],
      },
    ]);
  });

  it('does not discard an allow entry for an account that also has a deny entry', () => {
    expect(aclReaders(`${file} Everyone:(DENY)(W)\n    Everyone:(R)`, file)).toEqual(['Everyone']);
  });

  it('allows well-known SIDs, without trusting other users of the same name', () => {
    expect(
      extraAclReaders(['*S-1-5-18', 'S-1-5-32-544', 'OTHER\\owner', 'DOMAIN\\owner'], 'domain\\owner'),
    ).toEqual(['OTHER\\owner']);
    expect(treasuryAclFindings(t, file, [])).toEqual([]);
  });

  it('keeps Unicode account names distinct', () => {
    const readers = aclReaders(`${file} DOMAIN\\Thảo:(F)\n    DOMAIN\\Thắng:(R)`, file);
    expect(extraAclReaders(readers, 'domain\\thảo')).toEqual(['DOMAIN\\Thắng']);
  });
});

describe('doctor Windows treasury ACL', () => {
  it.skipIf(process.platform !== 'win32')('warns after real icacls grants Everyone read access', async () => {
    const dir = await tempDir();
    try {
      const treasury = path.join(dir.root, 'treasury file.json');
      const kingdom = await foundKingdom(dir.root, testIo(), '--treasury', treasury);
      await writeFile(treasury, '{}');
      const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
      await promisify(execFile)(
        path.join(systemRoot, 'System32', 'icacls.exe'),
        [treasury, '/grant', '*S-1-1-0:(R)'],
        { shell: false, windowsHide: true, env: { SystemRoot: systemRoot } },
      );
      const accounts = await readTreasuryAcl(treasury);
      expect(accounts.length).toBeGreaterThan(0);
      const io = testIo();
      await run(io, 'doctor', '--kingdom', kingdom, '--locale', 'en');
      expect(printed(io)).toContain(`! Treasury ${treasury}: other accounts have read access:`);
      for (const account of accounts) expect(printed(io)).toContain(account);
      expect(printed(io)).toContain('Disable inheritance');
    } finally {
      await dir.remove();
    }
  });

  it('adds no ACL warning on macOS or Linux', async () => {
    const dir = await tempDir();
    try {
      const treasury = path.join(dir.root, 'treasury.json');
      const kingdom = await foundKingdom(dir.root, testIo(), '--treasury', treasury);
      await writeFile(treasury, '{}');
      for (const platform of ['darwin', 'linux'] as const) {
        const io = testIo({ platform });
        await run(io, 'doctor', '--kingdom', kingdom, '--locale', 'en');
        expect(printed(io)).not.toMatch(/Windows ACL|other accounts have read access/);
      }
    } finally {
      await dir.remove();
    }
  });

  it.skipIf(process.platform !== 'win32')('warns if Windows ACL tools cannot start', async () => {
    const dir = await tempDir();
    try {
      const treasury = path.join(dir.root, 'treasury.json');
      const kingdom = await foundKingdom(dir.root, testIo(), '--treasury', treasury);
      await writeFile(treasury, '{}');
      const baseline = await run(testIo(), 'doctor', '--kingdom', kingdom, '--locale', 'en');
      vi.stubEnv('SystemRoot', path.join(dir.root, 'missing Windows'));
      const io = testIo();
      expect(await run(io, 'doctor', '--kingdom', kingdom, '--locale', 'en')).toBe(baseline);
      expect(printed(io)).toContain(`! Treasury ${treasury}: cannot inspect Windows ACL (`);
      vi.unstubAllEnvs();
    } finally {
      vi.unstubAllEnvs();
      await dir.remove();
    }
  });
});
