// The search every adapter declares (AH-09): PATH, a folder under the home, npm's on Windows, then a VS Code
// extension's binary, newest version first; `*` in the binary's folder is every subfolder (Codex's `bin/<os-arch>`).
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { locateTool, toolCandidates } from './locate.ts';
import type { ToolSearch } from './locate.ts';

const FIXED: ToolSearch = {
  program: 'tool',
  home_bin: ['.local', 'bin'],
  extension: { id: 'maker.tool-code', binary_dir: ['resources', 'native'] },
};
const PER_ARCH: ToolSearch = { program: 'tool', extension: { id: 'maker.tool', binary_dir: ['bin', '*'] } };

let home: string;
beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'elvaria tool home '));
});
afterEach(() => rm(home, RM_TEMP));

/** An empty file at `parts` under the home; its path as the search on this machine names it. */
async function file(...parts: string[]): Promise<string> {
  const at = path.join(home, ...parts);
  await mkdir(path.dirname(at), { recursive: true });
  await writeFile(at, '', 'utf8');
  return at;
}

const binary = process.platform === 'win32' ? 'tool.exe' : 'tool';

describe('toolCandidates', () => {
  it('looks on PATH, then the home folder, then npm, on Windows', async () => {
    const env = {
      USERPROFILE: 'C:\\Users\\me',
      Path: 'C:\\bin;;D:\\tools',
      APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
    };
    expect(await toolCandidates(FIXED, env, 'win32')).toEqual([
      'C:\\bin\\tool.exe',
      'C:\\bin\\tool.cmd',
      'D:\\tools\\tool.exe',
      'D:\\tools\\tool.cmd',
      'C:\\Users\\me\\.local\\bin\\tool.exe',
      'C:\\Users\\me\\AppData\\Roaming\\npm\\tool.cmd',
    ]);
  });

  it('takes the bare name on POSIX, and nothing of npm nor of a home it does not know', async () => {
    const env = { PATH: '/usr/bin:/opt/bin', APPDATA: '/nowhere' };
    expect(await toolCandidates(FIXED, env, 'darwin')).toEqual(['/usr/bin/tool', '/opt/bin/tool']);
    expect(await toolCandidates(PER_ARCH, { HOME: '/home/me' }, 'linux')).toEqual([]);
  });

  it('lists the extension binaries newest version first, from both VS Code builds', async () => {
    const env = { HOME: home, USERPROFILE: home, PATH: '' };
    const old = await file('.vscode', 'extensions', 'maker.tool-code-2.1.9', 'resources', 'native', binary);
    const newer = await file(
      '.vscode',
      'extensions',
      'maker.tool-code-2.10.0-win32-x64',
      'resources',
      'native',
      binary,
    );
    const insiders = await file(
      '.vscode-insiders',
      'extensions',
      'maker.tool-code-1.0.0',
      'resources',
      'native',
      binary,
    );
    await file('.vscode', 'extensions', 'maker.tool-code', 'resources', 'native', binary);
    await file('.vscode', 'extensions', 'other.tool-code-9.9.9', 'resources', 'native', binary);
    const candidates = await toolCandidates(FIXED, env, process.platform);
    expect(candidates.slice(-3)).toEqual([newer, old, insiders]);
  });

  it('reads every subfolder where the binary folder says `*`, in order', async () => {
    const env = { HOME: home, USERPROFILE: home, PATH: '' };
    const arm = await file('.vscode', 'extensions', 'maker.tool-1.0.0', 'bin', 'linux-arm64', binary);
    const x64 = await file('.vscode', 'extensions', 'maker.tool-1.0.0', 'bin', 'linux-x86_64', binary);
    expect(await toolCandidates(PER_ARCH, env, process.platform)).toEqual([arm, x64]);
  });
});

describe('locateTool', () => {
  it('finds the first candidate that is a file, and nothing when none is', async () => {
    const env = { HOME: home, USERPROFILE: home, PATH: path.join(home, 'empty') };
    expect(await locateTool(FIXED, env, process.platform)).toBeUndefined();
    // A folder named like the binary is not one.
    await mkdir(path.join(home, 'empty', binary), { recursive: true });
    expect(await locateTool(FIXED, env, process.platform)).toBeUndefined();
    const local = await file('.local', 'bin', binary);
    expect(await locateTool(FIXED, env, process.platform)).toBe(local);
  });
});
