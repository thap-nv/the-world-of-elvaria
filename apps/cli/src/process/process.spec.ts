import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fakeTool, tempDir } from '../../test/cli.ts';
import { findExecutable } from './find-executable.ts';
import { launchOf, shimTarget } from './launch.ts';
import { minimalEnv } from './minimal-env.ts';
import { runProcess } from './run-process.ts';
import type { TempDir } from '../../test/cli.ts';

describe('minimalEnv', () => {
  it('passes the toolchain variables and nothing else (ADR 0013)', () => {
    const env = { PATH: '/bin', HOME: '/home/o', ANTHROPIC_API_KEY: 'sk-ant-secret', GITHUB_TOKEN: 'ghp_x' };
    expect(minimalEnv(env)).toEqual({ PATH: '/bin', HOME: '/home/o' });
  });
});

describe('shimTarget', () => {
  it('finds the script of an npm and a pnpm shim', () => {
    const npm = '@ECHO off\r\n"%_prog%"  "%dp0%\\node_modules\\@google\\gemini-cli\\dist\\index.js" %*\r\n';
    expect(shimTarget('C:\\npm\\gemini.cmd', npm)).toBe(
      'C:\\npm\\node_modules\\@google\\gemini-cli\\dist\\index.js',
    );
    const pnpm = '@SETLOCAL\r\n"%~dp0\\..\\codex\\bin\\codex.mjs" %*\r\n';
    expect(shimTarget('C:\\pnpm\\bin\\codex.CMD', pnpm)).toBe('C:\\pnpm\\codex\\bin\\codex.mjs');
    expect(shimTarget('C:\\x\\tool.cmd', '@echo off\r\ntool.exe %*')).toBeUndefined();
  });
});

describe('processes', () => {
  let dir: TempDir;
  beforeEach(async () => {
    dir = await tempDir();
  });
  afterEach(() => dir.remove());

  it('starts a program found on PATH without a shell, shims included', async () => {
    const bin = path.join(dir.root, 'bin');
    const tool = await fakeTool(bin, 'claude', '2.1.318 (Claude Code)');
    const env = {
      PATH: [path.join(dir.root, 'empty'), bin].join(path.delimiter),
      PATHEXT: process.env.PATHEXT,
    };
    expect(await findExecutable('claude', env, process.platform)).toBe(tool);
    expect(await findExecutable('agy', env, process.platform)).toBeUndefined();
    expect(await findExecutable('claude', {}, process.platform)).toBeUndefined();
    const launch = await launchOf(tool, process.execPath);
    expect(launch).toBeDefined();
    if (launch === undefined) return;
    const outcome = await runProcess(launch.file, [...launch.args, '--version'], {
      env: { PATH: path.dirname(process.execPath) },
      timeoutMs: 20_000,
    });
    expect(outcome).toEqual({ code: 0, stdout: '2.1.318 (Claude Code)\n', stderr: '' });
  });

  it('reports a program that cannot start', async () => {
    const outcome = await runProcess(path.join(dir.root, 'missing'), [], { env: {}, timeoutMs: 5_000 });
    expect(outcome.code).toBeNull();
    expect(outcome.stderr).not.toBe('');
  });

  // Windows throws EFTYPE from spawn itself; POSIX may run an empty file as an empty sh script.
  it.runIf(process.platform === 'win32')('reports a broken executable instead of throwing', async () => {
    const broken = path.join(dir.root, 'broken.exe');
    await writeFile(broken, '', { mode: 0o755 });
    const outcome = await runProcess(broken, ['--version'], { env: {}, timeoutMs: 5_000 });
    expect(outcome.code).toBeNull();
    expect(outcome.stderr).not.toBe('');
  });

  it.runIf(process.platform !== 'win32')('skips a file without the execute bit', async () => {
    const bin = path.join(dir.root, 'bin');
    await mkdir(bin);
    await writeFile(path.join(bin, 'claude'), '#!/bin/sh\n');
    await chmod(path.join(bin, 'claude'), 0o644);
    expect(await findExecutable('claude', { PATH: bin }, process.platform)).toBeUndefined();
  });

  it.runIf(process.platform === 'win32')(
    'reads PATHEXT and cannot run a shim without a Node script',
    async () => {
      const bin = path.join(dir.root, 'bin');
      await mkdir(bin);
      await writeFile(path.join(bin, 'agy.bat'), '@echo off\r\nagy.exe %*\r\n');
      const found = await findExecutable('agy', { PATH: bin, PATHEXT: '.EXE;.BAT' }, 'win32');
      expect(found).toBe(path.join(bin, 'agy.bat'));
      expect(await launchOf(found ?? '', process.execPath)).toBeUndefined();
      expect(await findExecutable('agy', { PATH: bin }, 'win32')).toBe(path.join(bin, 'agy.bat'));
    },
  );
});
