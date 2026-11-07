// agy's command line on Windows (P1-15): agy takes its prompt in argv, and CreateProcess stops at 32 767
// characters, so a judge's prompt with a long diff is refused before a session spends mana, with the reason.
import { existsSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fakeRunner, openWorld, request } from './__fixtures__/agy.ts';
import { WINDOWS_COMMAND_LINE_MAX, commandLineLength, commandLineProblem } from './launch.ts';
import type { World } from './__fixtures__/agy.ts';

const AGY = { command: String.raw`C:\Users\owner\.gemini\bin\agy.exe`, args: [] };

describe('commandLineLength', () => {
  it('counts each argument quoted, with its quotes and backslashes escaped', () => {
    expect(commandLineLength({ command: 'agy', args: [] }, ['-p', 'say "hi"'])).toBe(6 + 5 + 13);
    expect(commandLineLength({ command: 'node', args: ['C:\\a.mjs'] }, [])).toBe(7 + 12);
  });
});

describe('commandLineProblem', () => {
  const prompt = (length: number) => 'x'.repeat(length);

  it('lets through what Windows takes, and anything elsewhere', () => {
    expect(commandLineProblem(AGY, ['-p', prompt(30_000)], 'win32')).toBeUndefined();
    expect(commandLineProblem(AGY, ['-p', prompt(40_000)], 'darwin')).toBeUndefined();
  });

  it('says why a prompt too long for Windows cannot reach agy', () => {
    expect(commandLineProblem(AGY, ['-p', prompt(WINDOWS_COMMAND_LINE_MAX)], 'win32')).toMatch(
      /^agy takes its prompt on the command line, and this one would be about 32\d{3} characters; Windows stops at 32767/,
    );
  });
});

describe('a session whose prompt Windows cannot pass', () => {
  let world: World;
  beforeEach(async () => {
    world = await openWorld();
  });
  afterEach(() => world.remove());

  it('is refused before agy is asked anything about the session', async () => {
    const base = request(world);
    const long = { ...base, prompt: { ...base.prompt, user: 'd'.repeat(WINDOWS_COMMAND_LINE_MAX) } };
    await expect(fakeRunner({ platform: 'win32' }).spawn(long)).rejects.toThrow(/Windows stops at 32767/);
    expect(existsSync(path.join(world.run_dir, 'stdout.jsonl'))).toBe(false);
  });
});
