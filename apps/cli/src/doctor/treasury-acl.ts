// SEC-07: inspect permissions only; never read or change the treasury's contents.
import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { Translate } from '@elvaria/i18n';
import { fromPortable } from '@elvaria/store';

import { finding } from './finding.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

const execute = promisify(execFile);
const ACL_TIMEOUT_MS = 10_000;
const READ_RIGHTS = new Set(['F', 'M', 'RX', 'R', 'GR', 'GA', 'RD']);
const TRUSTED_ACCOUNTS = ['nt authority\\system', 'builtin\\administrators', 's-1-5-18', 's-1-5-32-544'];
const DEFAULT_SYSTEM_ROOT = 'C:\\Windows';
const SYSTEM_DIRECTORY = 'System32';

/** The first ACE shares a line with the path; subsequent ACEs are indented. */
export function aclReaders(output: string, file: string): string[] {
  const readers = output.split(/\r?\n/u).flatMap((line) => {
    const entry = (line.startsWith(file) ? line.slice(file.length) : line).trim();
    const match = /^(.*?):((?:\([^)]*\))+)\s*$/u.exec(entry);
    if (match === null) return [];
    const [, account = '', permissions = ''] = match;
    const rights = permissions.toUpperCase().split(/[(),]/u);
    if (rights.includes('DENY') || rights.includes('IO')) return [];
    return rights.some((right) => READ_RIGHTS.has(right)) ? [account] : [];
  });
  return [...new Set(readers)];
}

/** SID spellings also occur for unresolved accounts; names compare without case. */
export function extraAclReaders(readers: readonly string[], currentUser: string): string[] {
  const allowed = new Set([currentUser.toLowerCase(), ...TRUSTED_ACCOUNTS]);
  return readers.filter((account) => !allowed.has(account.replace(/^\*/u, '').toLowerCase()));
}

/** Absolute OS tools and an explicit environment, with a bound on a stalled subprocess. */
export async function readTreasuryAcl(file: string): Promise<string[]> {
  const systemRoot = process.env.SystemRoot ?? DEFAULT_SYSTEM_ROOT;
  const options = {
    shell: false,
    windowsHide: true,
    timeout: ACL_TIMEOUT_MS,
    env: { SystemRoot: systemRoot },
    encoding: 'buffer' as const,
  };
  const { stdout: user } = await execute(path.join(systemRoot, SYSTEM_DIRECTORY, 'whoami.exe'), [], options);
  const { stdout } = await execute(path.join(systemRoot, SYSTEM_DIRECTORY, 'icacls.exe'), [file], options);
  // Never compare account names after lossy OEM decoding: distinct users could otherwise look identical.
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const currentUser = decoder.decode(user).trim();
  const output = decoder.decode(stdout);
  if (currentUser === '' || !output.includes('(')) throw new Error('Empty ACL or current user');
  return extraAclReaders(aclReaders(output, file), currentUser);
}

export function treasuryAclFindings(t: Translate, file: string, accounts: readonly string[]): Finding[] {
  if (accounts.length === 0) return [];
  return [
    finding('warn', t('cli.doctor.treasury_acl_shared', { path: file, accounts: accounts.join(', ') }), [
      t('cli.doctor.treasury_acl_fix', { path: file }),
    ]),
  ];
}

/** No extra finding or subprocess on macOS/Linux, or before the treasury exists. */
export async function checkTreasuryAcl(ctx: KingdomContext): Promise<Finding[]> {
  if (process.platform !== 'win32' || ctx.io.platform !== 'win32') return [];
  const file = fromPortable(ctx.kingdom.paths.treasury, 'win32');
  try {
    await stat(file);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    return [
      finding('warn', ctx.t('cli.doctor.treasury_acl_unreadable', { path: file, reason: String(error) })),
    ];
  }
  try {
    return treasuryAclFindings(ctx.t, file, await readTreasuryAcl(file));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [finding('warn', ctx.t('cli.doctor.treasury_acl_unreadable', { path: file, reason }))];
  }
}
