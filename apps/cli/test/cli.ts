// Test helpers: a fake machine for runCli (captured output, fixed clock, counting randomness) and throwaway
// folders. Folder names have a space and a Vietnamese letter on purpose: real kingdoms live in paths like
// `D:\Dummy\Tool - Personal\…` and owners name folders in Vietnamese.
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { InstantSchema, fixedClock } from '@elvaria/domain';

import { findExecutable } from '../src/process/find-executable.ts';
import { runCli } from '../src/run-cli.ts';
import type { CliIo, Env } from '../src/io.ts';

/** 2026-11-06T09:00:00+07:00, the day the plan was written. */
export const NOW = InstantSchema.parse(Date.parse('2026-11-06T02:00:00Z'));
export const TZ = 'Asia/Ho_Chi_Minh';

export interface TestIo extends CliIo {
  readonly printed: { readonly out: string[]; readonly err: string[] };
}

/** What a child process needs from the real environment to start on this OS (git, node). */
export function baseEnv(pathValue = process.env.PATH): Env {
  const keep = [
    'PATHEXT',
    'SystemRoot',
    'ComSpec',
    'HOME',
    'USERPROFILE',
    'TEMP',
    'TMP',
    'APPDATA',
    'LOCALAPPDATA',
  ];
  return { ...Object.fromEntries(keep.map((name) => [name, process.env[name]])), PATH: pathValue };
}

/**
 * Shared by every fake machine: the clock is fixed, so two commands in one test get different ids only because
 * their random bytes differ (a real clock moves and real bytes are random).
 */
let seed = 0;

export function testIo(overrides: Partial<CliIo> = {}): TestIo {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    env: baseEnv(),
    cwd: tmpdir(),
    home: tmpdir(),
    timeZone: TZ,
    platform: process.platform,
    nodePath: process.execPath,
    clock: fixedClock(NOW),
    random: {
      bytes: (count) => {
        seed += 1;
        return Uint8Array.from({ length: count }, (_, index) => (seed * 31 + index) % 256);
      },
    },
    printed: { out, err },
    ...overrides,
  };
}

export const run = (io: TestIo, ...argv: string[]): Promise<number> => runCli(argv, io);

/** Everything printed so far, both streams, one string: for `toContain` checks. */
export const printed = (io: TestIo): string => [...io.printed.out, ...io.printed.err].join('\n');

export interface TempDir {
  readonly root: string;
  remove(): Promise<void>;
}

export async function tempDir(): Promise<TempDir> {
  const root = await mkdtemp(path.join(tmpdir(), 'elvaria cli ạ '));
  return { root, remove: () => rm(root, { recursive: true, force: true }) };
}

/** A kingdom founded through the CLI itself, at `<dir>/kingdom`. */
export async function foundKingdom(dir: string, io = testIo(), ...extra: string[]): Promise<string> {
  const kingdom = path.join(dir, 'kingdom');
  const code = await run(io, 'init', '--kingdom', kingdom, '--name', 'Bình Minh', '--tz', TZ, ...extra);
  if (code !== 0) throw new Error(`init failed: ${printed(io)}`);
  return kingdom;
}

/** git, run directly, for building fixture repos. */
export const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();

/** A new git repo on branch main, without commits. */
export async function gitRepo(folder: string): Promise<string> {
  await mkdir(folder, { recursive: true });
  git(folder, 'init', '-q', '-b', 'main');
  return folder;
}

/**
 * A program named `name` in `dir` that prints `version` and exits with `code`: an npm-style `.cmd` shim around a
 * Node script on Windows (the path doctor must read), an executable with a shebang elsewhere.
 */
export async function fakeTool(dir: string, name: string, version: string, code = 0): Promise<string> {
  await mkdir(dir, { recursive: true });
  const source = `process.stdout.write(${JSON.stringify(`${version}\n`)}); process.exitCode = ${code};\n`;
  if (process.platform === 'win32') {
    await writeFile(path.join(dir, `${name}-cli.cjs`), source);
    const shim = path.join(dir, `${name}.cmd`);
    await writeFile(shim, `@ECHO off\r\n"%_prog%"  "%dp0%\\${name}-cli.cjs" %*\r\n`);
    return shim;
  }
  const file = path.join(dir, name);
  await writeFile(file, `#!/usr/bin/env node\n${source}`);
  await chmod(file, 0o755);
  return file;
}

/** PATH holding only these folders, git's and node's: no real Claude Code or agy can leak into a test. */
export async function isolatedPath(...dirs: string[]): Promise<string> {
  const gitFile = await findExecutable('git', process.env, process.platform);
  if (gitFile === undefined) throw new Error('these tests need git on PATH');
  return [...dirs, path.dirname(gitFile), path.dirname(process.execPath)].join(path.delimiter);
}

/** PATH with node and nothing else: git cannot be found. */
export const pathWithoutGit = (): string => path.dirname(process.execPath);
