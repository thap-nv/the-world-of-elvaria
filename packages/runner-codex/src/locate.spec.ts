// Where Codex CLI is before doctor pins it (spike Codex 2026-11-12 §1.1): PATH, npm's folder, then the VS Code
// extension's binary, newest extension first.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { codexCandidates, locateCodex } from './locate.ts';

let home: string;
beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'elvaria codex home '));
});
afterEach(() => rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

/** Writes an extension binary under the home folder; returns its path as the search on `platform` names it. */
async function extension(
  name: string,
  arch: string,
  binary: string,
  platform = process.platform,
): Promise<string> {
  const dir = path.join(home, '.vscode', 'extensions', name, 'bin', arch);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, binary), '', 'utf8');
  const p = platform === 'win32' ? path.win32 : path.posix;
  return p.join(home, '.vscode', 'extensions', name, 'bin', arch, binary);
}

describe('locateCodex', () => {
  // The search reads a real folder through Windows paths (`path.win32` of USERPROFILE), which only a Windows file
  // system resolves: on macOS the home in %TEMP% reads `\var\folders\…` and nothing is found (CI, PS-21).
  it.runIf(process.platform === 'win32')(
    "finds the newest extension's binary on Windows when PATH has none",
    async () => {
      await extension('openai.chatgpt-26.906.1-win32-x64', 'windows-x86_64', 'codex.exe');
      const newest = await extension(
        'openai.chatgpt-26.1106.51428-win32-x64',
        'windows-x86_64',
        'codex.exe',
        'win32',
      );
      await mkdir(path.join(home, '.vscode', 'extensions', 'other.ext-1.0.0'), { recursive: true });
      expect(await locateCodex({ USERPROFILE: home, PATH: '' }, 'win32')).toBe(newest);
    },
  );

  it('looks on PATH and in npm first, and finds nothing in an empty home', async () => {
    const env = { HOME: home, PATH: '/usr/local/bin:/opt/bin' };
    const candidates = await codexCandidates(env, 'darwin');
    expect(candidates.slice(0, 2)).toEqual(['/usr/local/bin/codex', '/opt/bin/codex']);
    const windows = await codexCandidates(
      { USERPROFILE: home, APPDATA: 'C:\\AppData', Path: 'C:\\bin' },
      'win32',
    );
    expect(windows.slice(0, 3)).toEqual([
      'C:\\bin\\codex.exe',
      'C:\\bin\\codex.cmd',
      'C:\\AppData\\npm\\codex.cmd',
    ]);
    expect(await locateCodex({ PATH: '' }, 'linux')).toBeUndefined();
    expect(await locateCodex({ HOME: home }, 'linux')).toBeUndefined();
  });

  it('finds the binary of a macOS extension under its own arch folder', async () => {
    const file = await extension(
      'openai.chatgpt-26.1106.51428-darwin-arm64',
      'macos-aarch64',
      'codex',
      'darwin',
    );
    expect(await locateCodex({ HOME: home, PATH: '' }, 'darwin')).toBe(file);
  });
});
