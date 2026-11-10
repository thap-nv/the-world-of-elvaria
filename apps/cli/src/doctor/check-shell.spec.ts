import path from 'node:path';

import { translator } from '@elvaria/i18n';
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
import { policyFinding, readExecutionPolicy } from './check-shell.ts';
import type { TempDir } from '../../test/cli.ts';

const t = translator('en');

describe('policyFinding (P1-41)', () => {
  it.each(['RemoteSigned', 'Unrestricted', 'Bypass'])('%s runs local scripts', (policy) => {
    expect(policyFinding('gemini', { kind: 'read', policy }, t)).toEqual({
      level: 'ok',
      text: `Tribe gemini: PowerShell runs local scripts (Execution Policy ${policy}), so pnpm.ps1 and npm's other shims start in its sessions.`,
      details: [],
    });
  });

  it.each(['Restricted', 'AllSigned', 'Undefined'])(
    '%s is an error with the command that fixes it',
    (policy) => {
      const found = policyFinding('gemini', { kind: 'read', policy }, t);
      expect(found.level).toBe('error');
      expect(found.text).toContain(`Tribe gemini: PowerShell refuses scripts (Execution Policy ${policy}).`);
      expect(found.details?.[0]).toContain(
        'Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned',
      );
    },
  );

  it('warns when PowerShell cannot be asked', () => {
    expect(policyFinding('gemini', { kind: 'no_powershell' }, t).level).toBe('warn');
    expect(policyFinding('gemini', { kind: 'unread' }, t).text).toContain('did not say its Execution Policy');
  });
});

describe('readExecutionPolicy', () => {
  let dir: TempDir;
  beforeEach(async () => {
    dir = await tempDir();
  });
  afterEach(() => dir.remove());

  const ioWith = async (...dirs: string[]) => testIo({ env: baseEnv(await isolatedPath(...dirs)) });

  it('reads what Get-ExecutionPolicy prints, and nothing it does not know', async () => {
    const restricted = path.join(dir.root, 'restricted');
    await fakeTool(restricted, 'powershell', 'Restricted');
    expect(await readExecutionPolicy(await ioWith(restricted))).toEqual({
      kind: 'read',
      policy: 'Restricted',
    });
    const chatty = path.join(dir.root, 'chatty');
    await fakeTool(chatty, 'powershell', 'Windows PowerShell 5.1');
    expect(await readExecutionPolicy(await ioWith(chatty))).toEqual({ kind: 'unread' });
    const failing = path.join(dir.root, 'failing');
    await fakeTool(failing, 'powershell', 'Restricted', 1);
    expect(await readExecutionPolicy(await ioWith(failing))).toEqual({ kind: 'unread' });
    expect(await readExecutionPolicy(await ioWith())).toEqual({ kind: 'no_powershell' });
  });
});

describe('elvaria doctor: PowerShell for agy (P1-41)', () => {
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

  const doctor = async (policy: string, ...args: string[]) => {
    const shell = path.join(dir.root, `powershell ${policy}`);
    await fakeTool(shell, 'powershell', policy);
    const io = testIo({ env: baseEnv(await isolatedPath(bin, shell)) });
    const code = await run(
      io,
      'doctor',
      '--acknowledge-terms',
      'gemini',
      ...args,
      '--kingdom',
      kingdom,
      '--locale',
      'en',
    );
    return { code, text: printed(io) };
  };

  it.runIf(process.platform === 'win32')(
    'fails a Restricted policy for the agy tribe only, and keeps it off (Windows)',
    async () => {
      const restricted = await doctor('Restricted');
      expect(restricted.code).toBe(1);
      expect(restricted.text).toContain(
        '✗ Tribe gemini: PowerShell refuses scripts (Execution Policy Restricted). Its sessions run commands in powershell.exe',
      );
      expect(restricted.text).toContain(
        '    In PowerShell run: Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned',
      );
      expect(restricted.text).not.toContain('Tribe claude: PowerShell');

      const allowed = await doctor('RemoteSigned');
      expect(allowed.code).toBe(0);
      expect(allowed.text).toContain(
        '✓ Tribe gemini: PowerShell runs local scripts (Execution Policy RemoteSigned)',
      );
    },
  );

  it.runIf(process.platform === 'win32')(
    'does not enable an agy tribe whose PowerShell refuses scripts (Windows)',
    async () => {
      await run(testIo(), 'tribe', 'disable', 'gemini', '--kingdom', kingdom);
      const { code, text } = await doctor('Restricted', '--enable', 'gemini');
      expect(code).toBe(1);
      expect(text).toContain('✗ Tribe gemini stays disabled until the problem above is fixed.');
    },
  );

  it.runIf(process.platform !== 'win32')('asks nothing of PowerShell outside Windows', async () => {
    const { code, text } = await doctor('Restricted');
    expect(code).toBe(0);
    expect(text).not.toContain('PowerShell');
  });
});
