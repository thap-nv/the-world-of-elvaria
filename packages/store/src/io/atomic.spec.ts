import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as FsPromises from 'node:fs/promises';

// rename stays the real one unless a test makes it fail: Windows answers EPERM to most failed renames,
// which the code retries for TRANSIENT_BUDGET_MS, so a real failure would make each such test that slow.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

import { tempKingdom } from '../../test/kingdom.ts';
import {
  TRANSIENT_BUDGET_MS,
  errorCode,
  isTempFile,
  moveFile,
  pathExists,
  readTextFile,
  retryTransient,
  tempPathFor,
  writeFileAtomic,
} from './atomic.ts';
import type { TempKingdom } from '../../test/kingdom.ts';

const fsError = (code: string): Error => Object.assign(new Error(code), { code });

let kingdom: TempKingdom;
beforeEach(async () => {
  kingdom = await tempKingdom();
});
afterEach(() => kingdom.remove());

describe('writeFileAtomic (ADR 0004, 0015)', () => {
  it('creates the folder and the file, then replaces it whole', async () => {
    const target = path.join(kingdom.root, 'quests', 'q.json');
    await writeFileAtomic(target, 'first\n');
    await writeFileAtomic(target, 'second\n');
    expect(await readFile(target, 'utf8')).toBe('second\n');
    expect(await readdir(path.dirname(target))).toEqual(['q.json']);
  });

  it('waits out a file another process holds open', async () => {
    vi.mocked(rename).mockRejectedValueOnce(fsError('EPERM')).mockRejectedValueOnce(fsError('EBUSY'));
    const target = path.join(kingdom.root, 'held.json');
    await writeFileAtomic(target, 'done');
    expect(await readFile(target, 'utf8')).toBe('done');
  });

  it('removes its temp file when the write fails', async () => {
    vi.mocked(rename).mockRejectedValueOnce(fsError('ENOSPC'));
    await expect(writeFileAtomic(path.join(kingdom.root, 'full.json'), 'x')).rejects.toThrow('ENOSPC');
    expect(await readdir(kingdom.root)).toEqual([]);
  });

  it('names temp files so that listings of *.json skip them', () => {
    const temp = path.basename(tempPathFor(path.join('inbox', '01J.json')));
    expect(isTempFile(temp)).toBe(true);
    expect(temp.endsWith('.json')).toBe(false);
    expect(isTempFile('01J.json')).toBe(false);
    expect(isTempFile('.hidden.json')).toBe(false);
  });
});

describe('retryTransient', () => {
  it('retries the transient Windows errors until the action succeeds', async () => {
    const action = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(fsError('EPERM'))
      .mockRejectedValueOnce(fsError('EBUSY'))
      .mockRejectedValueOnce(fsError('EACCES'))
      .mockResolvedValue('done');
    expect(await retryTransient(action)).toBe('done');
    expect(action).toHaveBeenCalledTimes(4);
  });

  it('gives up once the time budget is spent', async () => {
    const action = vi.fn<() => Promise<void>>().mockRejectedValue(fsError('EPERM'));
    const started = performance.now();
    await expect(retryTransient(action, 100)).rejects.toThrow('EPERM');
    expect(performance.now() - started).toBeGreaterThanOrEqual(100);
    expect(action.mock.calls.length).toBeGreaterThan(2);
    expect(TRANSIENT_BUDGET_MS).toBeGreaterThanOrEqual(5000);
  });

  it('does not retry other errors', async () => {
    const action = vi.fn<() => Promise<void>>().mockRejectedValue(fsError('ENOSPC'));
    await expect(retryTransient(action)).rejects.toThrow('ENOSPC');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('reads codes only from errors that carry one', () => {
    expect(errorCode(fsError('ENOENT'))).toBe('ENOENT');
    expect(errorCode(new Error('plain'))).toBeUndefined();
    expect(errorCode('ENOENT')).toBeUndefined();
  });
});

describe('reading and moving', () => {
  it('reads a file, or undefined when it is missing', async () => {
    const file = path.join(kingdom.root, 'a.json');
    expect(await readTextFile(file)).toBeUndefined();
    expect(await pathExists(file)).toBe(false);
    await writeFile(file, 'text');
    expect(await readTextFile(file)).toBe('text');
    expect(await pathExists(file)).toBe(true);
  });

  it('throws what it cannot handle', async () => {
    // Reading a folder as a file: EISDIR (EPERM on some Windows builds, retried, then thrown).
    await expect(readTextFile(kingdom.root)).rejects.toThrow();
    await expect(pathExists(path.join(kingdom.root, 'nul\0'))).rejects.toThrow();
  });

  it('moves a file into a folder it creates; false when there is nothing to move', async () => {
    const from = path.join(kingdom.root, 'inbox', 'x.json');
    const to = path.join(kingdom.root, 'inbox', 'done', 'x.json');
    await mkdir(path.dirname(from), { recursive: true });
    await writeFile(from, '{}');
    expect(await moveFile(from, to)).toBe(true);
    expect(await readFile(to, 'utf8')).toBe('{}');
    expect(await moveFile(from, to)).toBe(false);
  });

  it('throws when the move fails for another reason', async () => {
    vi.mocked(rename).mockRejectedValueOnce(fsError('EXDEV'));
    const from = path.join(kingdom.root, 'x.json');
    await writeFile(from, '{}');
    await expect(moveFile(from, path.join(kingdom.root, 'y.json'))).rejects.toThrow('EXDEV');
  });
});
