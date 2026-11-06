import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { plantText, tempDir } from '../test/temp.ts';
import { MAX_LINE_BYTES, READ_CHUNK_BYTES } from './constants.ts';
import { endOfLines, readLines, splitLines } from './read-lines.ts';
import type { TempDir } from '../test/temp.ts';

describe('splitLines', () => {
  it('returns complete lines with their offsets and stops before an unfinished one', () => {
    const data = Buffer.from('{"a":1}\n\n  \n{"b":2}\n{"c"', 'utf8');
    expect(splitLines(data, 100)).toEqual({
      lines: [
        { offset: 100, text: '{"a":1}' },
        { offset: 112, text: '{"b":2}' },
      ],
      end: 120,
    });
  });

  it('consumes nothing when no newline has arrived yet', () => {
    expect(splitLines(Buffer.from('{"a"', 'utf8'), 7)).toEqual({ lines: [], end: 7 });
  });
});

describe('readLines', () => {
  let temp: TempDir;
  beforeEach(async () => {
    temp = await tempDir();
  });
  afterEach(() => temp.remove());

  it('reads lines that straddle read chunks, multi-byte characters included', async () => {
    const file = path.join(temp.root, 'big.jsonl');
    const line = JSON.stringify({ note: 'Sa lầy trong nhiệm vụ — ổn định '.repeat(40) });
    const count = Math.ceil((2.5 * READ_CHUNK_BYTES) / Buffer.byteLength(`${line}\n`));
    await writeFile(file, `${line}\n`.repeat(count), 'utf8');
    const read = await readLines(file, 0);
    expect(read.lines).toHaveLength(count);
    expect(read.lines.every((entry) => entry.text === line)).toBe(true);
    expect(read.lines[1]?.offset).toBe(Buffer.byteLength(`${line}\n`));
    expect(read.offset).toBe(read.size);
  });

  it('starts at the offset and leaves an unfinished last line for the next read', async () => {
    const file = path.join(temp.root, 'log.jsonl');
    await plantText(file, '{"a":1}\n{"b":2}\n{"c":');
    const read = await readLines(file, 8);
    expect(read).toMatchObject({ lines: [{ offset: 8, text: '{"b":2}' }], offset: 16, size: 21 });
    expect(read.restarted).toBe(false);
  });

  it('reads a missing file as empty, and says so when the caller expected bytes', async () => {
    const file = path.join(temp.root, 'none.jsonl');
    expect(await readLines(file, 0)).toEqual({ lines: [], offset: 0, size: 0, restarted: false });
    expect(await readLines(file, 40)).toMatchObject({ offset: 0, restarted: true });
  });

  it('starts over when the file is shorter than the offset (replaced by hand)', async () => {
    const file = path.join(temp.root, 'log.jsonl');
    await plantText(file, '{"a":1}\n');
    expect(await readLines(file, 500)).toMatchObject({ lines: [{ offset: 0 }], offset: 8, restarted: true });
  });
});

describe('endOfLines', () => {
  let temp: TempDir;
  beforeEach(async () => {
    temp = await tempDir();
  });
  afterEach(() => temp.remove());

  it('points after the last newline, before a line still being written', async () => {
    const file = path.join(temp.root, 'log.jsonl');
    await plantText(file, '{"a":1}\n{"b":2}\n');
    expect(await endOfLines(file)).toBe(16);
    await plantText(file, '{"c":', true);
    expect(await endOfLines(file)).toBe(16);
  });

  it('finds the last newline of a file larger than the window', async () => {
    const file = path.join(temp.root, 'log.jsonl');
    const line = `${'x'.repeat(1000)}\n`;
    const count = Math.ceil((2 * MAX_LINE_BYTES) / line.length);
    await plantText(file, `${line.repeat(count)}{"unfinished":`);
    expect(await endOfLines(file)).toBe(line.length * count);
  });

  it('is 0 for a missing file and for a file that is one unfinished line', async () => {
    expect(await endOfLines(path.join(temp.root, 'none.jsonl'))).toBe(0);
    const file = path.join(temp.root, 'log.jsonl');
    await plantText(file, '{"a":');
    expect(await endOfLines(file)).toBe(0);
  });
});
