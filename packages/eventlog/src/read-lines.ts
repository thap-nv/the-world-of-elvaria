// Complete lines of a JSONL file from a byte offset. Lines are cut on the newline byte before decoding: 0x0A
// never occurs inside a UTF-8 sequence, so a chunk boundary cannot split a character into garbage.
import { open } from 'node:fs/promises';

import { MAX_LINE_BYTES, NEWLINE, READ_CHUNK_BYTES } from './constants.ts';
import { isMissing } from './errors.ts';
import type { FileHandle } from 'node:fs/promises';

export interface RawLine {
  /** Byte offset of the line in its file. */
  readonly offset: number;
  readonly text: string;
}

export interface LinesRead {
  readonly lines: readonly RawLine[];
  /** Offset after the last complete line: where the next read starts. */
  readonly offset: number;
  /** File size at the time of reading; the bytes after `offset` are a line not yet ended. */
  readonly size: number;
  /** The file was shorter than the offset asked for (replaced or cut by hand), so reading started over at 0. */
  readonly restarted: boolean;
}

/** The complete lines of `data`, whose first byte sits at `base` in its file; blank lines are skipped. */
export function splitLines(data: Buffer, base: number): { lines: RawLine[]; end: number } {
  const lines: RawLine[] = [];
  let start = 0;
  for (let newline = data.indexOf(NEWLINE); newline !== -1; newline = data.indexOf(NEWLINE, start)) {
    const text = data.toString('utf8', start, newline);
    if (text.trim() !== '') lines.push({ offset: base + start, text });
    start = newline + 1;
  }
  return { lines, end: base + start };
}

async function collectLines(handle: FileHandle, start: number, size: number) {
  const lines: RawLine[] = [];
  let carry = Buffer.alloc(0);
  let end = start;
  for (let position = start; position < size;) {
    const chunk = Buffer.alloc(Math.min(READ_CHUNK_BYTES, size - position));
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
    if (bytesRead === 0) break;
    position += bytesRead;
    const data = Buffer.concat([carry, chunk.subarray(0, bytesRead)]);
    const split = splitLines(data, end);
    for (const line of split.lines) lines.push(line);
    carry = data.subarray(split.end - end);
    end = split.end;
  }
  return { lines, end };
}

async function openToRead(file: string): Promise<FileHandle | undefined> {
  try {
    return await open(file, 'r');
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/** The complete lines from `from` to the current end of `file`; a missing file reads as empty. */
export async function readLines(file: string, from: number): Promise<LinesRead> {
  const handle = await openToRead(file);
  if (handle === undefined) return { lines: [], offset: 0, size: 0, restarted: from > 0 };
  try {
    const { size } = await handle.stat();
    const restarted = size < from;
    const { lines, end } = await collectLines(handle, restarted ? 0 : from, size);
    return { lines, offset: end, size, restarted };
  } finally {
    await handle.close();
  }
}

/**
 * Offset after the last complete line of `file`: where a reader that wants only new lines starts. A line not
 * yet ended is shorter than MAX_LINE_BYTES, so the newline before it lies within that many bytes of the end.
 */
export async function endOfLines(file: string): Promise<number> {
  const handle = await openToRead(file);
  if (handle === undefined) return 0;
  try {
    const { size } = await handle.stat();
    const window = Math.min(size, MAX_LINE_BYTES);
    const tail = Buffer.alloc(window);
    await handle.read(tail, 0, window, size - window);
    const newline = tail.lastIndexOf(NEWLINE);
    return newline === -1 ? size - window : size - window + newline + 1;
  } finally {
    await handle.close();
  }
}
