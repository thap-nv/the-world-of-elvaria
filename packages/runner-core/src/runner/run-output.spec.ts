// A run's output files that cannot be written (fix/session-notes, (108)): the stream's error is a note, never an
// error nobody listens to, which would end the Steward's process. A folder where the file should be fails on every
// OS: macOS refuses to open it, Windows opens it and refuses the first write. The run folder removed before the
// streams open is fix/cli-lines' case: an adapter that opened its output and then threw, its test folder cleaned.
import { existsSync, rmSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { NOTE_PREFIX, STDERR_FILE, STDOUT_FILE, openRunOutput } from './run-output.ts';

let root: string;
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria run output '));
});
afterAll(() => rm(root, RM_TEMP));

/** A run folder in which `file` is a folder, so its stream fails. */
async function runDirWithout(name: string, file: string): Promise<string> {
  const dir = path.join(root, name);
  await mkdir(path.join(dir, file), { recursive: true });
  return dir;
}

describe('openRunOutput when a file cannot be written', () => {
  it('notes in stderr.log that stdout.jsonl failed, and keeps writing stderr.log', async () => {
    const dir = await runDirWithout('no stdout', STDOUT_FILE);
    const output = openRunOutput(dir);
    output.stdout(JSON.stringify({ type: 'system' }));
    output.stderr('cli says\n');
    output.note('session judged broken');
    output.stdout(JSON.stringify({ type: 'result' }));
    await output.close();
    const lines = (await readFile(path.join(dir, STDERR_FILE), 'utf8')).trimEnd().split('\n');
    expect(lines).toContain('cli says');
    expect(lines).toContain(`${NOTE_PREFIX}session judged broken`);
    const failed = lines.filter((line) => line.includes(`${STDOUT_FILE} could not be written`));
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatch(
      new RegExp(`^\\[elvaria\\] ${STDOUT_FILE} could not be written, its lines are lost: EISDIR`),
    );
  });

  it('keeps stdout.jsonl whole when stderr.log fails, its own error having nowhere to go', async () => {
    const dir = await runDirWithout('no stderr', STDERR_FILE);
    const output = openRunOutput(dir);
    output.stderr('cli says\n');
    output.stdout(JSON.stringify({ type: 'system' }));
    output.note('session judged broken');
    output.stdout(JSON.stringify({ type: 'result' }));
    await output.close();
    expect(await readFile(path.join(dir, STDOUT_FILE), 'utf8')).toBe(
      '{"type":"system"}\n{"type":"result"}\n',
    );
  });

  it('closes when the run folder went before the files opened, and makes it no more', async () => {
    const dir = path.join(root, 'gone');
    const output = openRunOutput(dir);
    // The streams open on a later tick: the folder is gone by then, so both fail with ENOENT.
    rmSync(dir, { recursive: true, force: true });
    output.stdout(JSON.stringify({ type: 'system' }));
    output.note('never written');
    await expect(output.close()).resolves.toBeUndefined();
    expect(existsSync(dir)).toBe(false);
  });
});
