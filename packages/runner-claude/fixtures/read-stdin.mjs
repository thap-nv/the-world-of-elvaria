// Stdin of the fake CLI (the prompt) and of the fake hook (the payload), read as the real hook reads it
// (packages/hooks/src/stdin.ts, P1-36). `readFileSync(0)` throws away what it had read when a read fails with EAGAIN:
// a pipe left non-blocking whose writer has not closed it yet, which macOS CI met with prompts larger than its
// 8 KiB socket buffer (PR #76: the fake CLI got an empty prompt). This loop keeps every chunk and, on EAGAIN, waits a
// millisecond and reads on.
import { readSync } from 'node:fs';

const pause = new Int32Array(new SharedArrayBuffer(4));

/** fd 0: `read` returns 0 at the end and throws EAGAIN when a non-blocking pipe is empty. */
export const FD_0 = {
  read: (buffer) => readSync(0, buffer, 0, buffer.length, null),
  wait: (ms) => {
    Atomics.wait(pause, 0, 0, ms);
  },
};

export function readStdin(source = FD_0) {
  const chunks = [];
  const buffer = Buffer.alloc(64 * 1024);
  for (;;) {
    let count;
    try {
      count = source.read(buffer);
    } catch (error) {
      if (error?.code !== 'EAGAIN') throw error;
      source.wait(1);
      continue;
    }
    if (count === 0) return Buffer.concat(chunks).toString('utf8');
    chunks.push(Buffer.from(buffer.subarray(0, count)));
  }
}
