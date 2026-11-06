import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { printed, run, tempDir, testIo } from '../test/cli.ts';
import { COMMANDS } from './commands.ts';
import { localeFlag, lookupCommand } from './run-cli.ts';
import type { TempDir } from '../test/cli.ts';

describe('lookupCommand', () => {
  it('finds commands by their leading words', () => {
    const quest = lookupCommand(['quest', 'add', '--title', 'x']);
    expect(quest.kind === 'command' && quest.spec.name).toEqual(['quest', 'add']);
    expect(quest.kind === 'command' && quest.rest).toEqual(['--title', 'x']);
    const init = lookupCommand(['init', '--name', 'x']);
    expect(init.kind === 'command' && init.rest).toEqual(['--name', 'x']);
  });

  it('answers help for nothing, help words, and a bare group', () => {
    expect(lookupCommand([])).toEqual({ kind: 'overview' });
    expect(lookupCommand(['--help'])).toEqual({ kind: 'overview' });
    expect(lookupCommand(['help'])).toEqual({ kind: 'overview' });
    expect(lookupCommand(['quest'])).toEqual({ kind: 'overview', group: 'quest' });
    expect(lookupCommand(['quest', '--kingdom', 'k'])).toEqual({ kind: 'overview', group: 'quest' });
  });

  it('names what it does not know', () => {
    expect(lookupCommand(['conquer'])).toEqual({ kind: 'unknown', words: 'conquer' });
    expect(lookupCommand(['quest', 'conquer'])).toEqual({ kind: 'unknown', words: 'quest conquer' });
  });

  it('has one spec per command name, with help for every option', () => {
    const names = COMMANDS.map((spec) => spec.name.join(' '));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('localeFlag', () => {
  it('reads --locale in both spellings, anywhere', () => {
    expect(localeFlag(['quest', 'list', '--locale', 'en'])).toBe('en');
    expect(localeFlag(['--locale=vi', 'doctor'])).toBe('vi');
    expect(localeFlag(['doctor', '--locale'])).toBe('');
    expect(localeFlag(['doctor'])).toBeUndefined();
  });
});

describe('runCli', () => {
  let dir: TempDir;
  beforeEach(async () => {
    dir = await tempDir();
  });
  afterEach(() => dir.remove());

  it('prints the overview in Vietnamese by default and in English on request', async () => {
    const vi = testIo();
    expect(await run(vi)).toBe(0);
    expect(printed(vi)).toContain('Cách dùng: elvaria <lệnh> [tùy chọn]');
    const en = testIo();
    expect(await run(en, '--help', '--locale', 'en')).toBe(0);
    expect(printed(en)).toContain('Usage: elvaria <command> [options]');
    for (const spec of COMMANDS) expect(printed(en)).toContain(spec.name.join(' '));
  });

  it('prints one group and one command', async () => {
    const group = testIo();
    expect(await run(group, 'territory', '--locale', 'en')).toBe(0);
    expect(printed(group)).toContain('Usage: elvaria territory <command> [options]');
    expect(printed(group)).not.toContain('quest add');
    const command = testIo();
    expect(await run(command, 'quest', 'add', '--help', '--locale', 'en')).toBe(0);
    expect(printed(command)).toContain('--title <text>');
    expect(printed(command)).toContain('(required)');
    expect(printed(command)).toContain('-h, --help');
  });

  it('refuses unknown commands, options and locales with exit 2', async () => {
    const unknown = testIo();
    expect(await run(unknown, 'quest', 'conquer')).toBe(2);
    expect(unknown.printed.err).toEqual(['Không có lệnh «quest conquer».', 'Xem: elvaria --help']);
    const option = testIo();
    expect(await run(option, 'migrate', '--force', '--locale', 'en')).toBe(2);
    expect(option.printed.err).toEqual(['There is no option --force.', 'See: elvaria migrate --help']);
    const locale = testIo();
    expect(await run(locale, 'doctor', '--locale', 'fr')).toBe(2);
    expect(locale.printed.err).toEqual(['Không có ngôn ngữ «fr»; chọn một trong: vi, en.']);
  });

  it('names a missing option value, a missing argument and an extra one', async () => {
    const value = testIo();
    expect(await run(value, 'quest', 'show', 'q_1', '--kingdom', '--locale', 'en')).toBe(2);
    expect(value.printed.err[0]).toBe('Option --kingdom is missing its value, or takes none.');
    const missing = testIo();
    expect(await run(missing, 'quest', 'show', '--locale', 'en')).toBe(2);
    expect(missing.printed.err[0]).toBe('Missing argument <quest>.');
    const extra = testIo();
    expect(await run(extra, 'migrate', 'now', '--locale', 'en')).toBe(2);
    expect(extra.printed.err[0]).toBe('Unexpected argument: now');
    const required = testIo();
    expect(await run(required, 'init', '--kingdom', dir.root, '--locale', 'en')).toBe(2);
    expect(required.printed.err[0]).toBe('Missing required option --name.');
  });

  it('turns an IO failure nobody can act on into one line and exit 1', async () => {
    // A folder where kingdom.json should be: reading it fails below the store (EISDIR on every OS).
    await mkdir(path.join(dir.root, 'kingdom.json'));
    const io = testIo();
    expect(await run(io, 'doctor', '--kingdom', dir.root, '--locale', 'en')).toBe(1);
    expect(io.printed.err.join('\n')).toMatch(/^Unexpected error: /);
  });
});
