// The payload on fd 0, read whole (implementation-plan §3.6, P1-36). `readFileSync(0)` loops over the pipe too,
// but when a read fails with EAGAIN (a pipe left non-blocking whose writer has not closed it yet: macOS CI,
// PR #32 and PR #76) it throws away what it had read, and the stream that took over got only the rest. This loop
// keeps every chunk and, on EAGAIN, waits a millisecond and reads on: one synchronous reader, no stream.
import { readSync } from 'node:fs';

export interface StdinSource {
  /** Reads into `buffer`, returns the byte count, 0 at the end; throws EAGAIN when a non-blocking pipe is empty. */
  readonly read: (buffer: Buffer) => number;
  /** Blocks for `ms` before the next read. */
  readonly wait: (ms: number) => void;
}

const CHUNK_BYTES = 64 * 1024;
/** The writer is the CLI on the same machine, refilling the pipe as fast as it drains. */
const RETRY_MS = 1;

const pause = new Int32Array(new SharedArrayBuffer(4));

export const FD_0: StdinSource = {
  read: (buffer) => readSync(0, buffer, 0, buffer.length, null),
  wait: (ms) => {
    Atomics.wait(pause, 0, 0, ms);
  },
};

const isAgain = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'EAGAIN';

/** Everything on stdin up to its end, decoded as UTF-8 once: a character split between chunks stays whole. */
export function readStdin(source: StdinSource = FD_0): string {
  const chunks: Buffer[] = [];
  const buffer = Buffer.alloc(CHUNK_BYTES);
  for (;;) {
    let count: number;
    try {
      count = source.read(buffer);
    } catch (error) {
      if (!isAgain(error)) throw error;
      source.wait(RETRY_MS);
      continue;
    }
    if (count === 0) return Buffer.concat(chunks).toString('utf8');
    chunks.push(Buffer.from(buffer.subarray(0, count)));
  }
}
