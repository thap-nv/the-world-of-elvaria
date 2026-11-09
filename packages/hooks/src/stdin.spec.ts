import { describe, expect, it } from 'vitest';

import { FD_0, readStdin } from './stdin.ts';
import type { StdinSource } from './stdin.ts';

const again = (): Error =>
  Object.assign(new Error('EAGAIN: resource temporarily unavailable, read'), { code: 'EAGAIN' });

/** A pipe that hands out `steps` in order: bytes, or the string `EAGAIN` while the writer has not written more. */
function pipe(steps: readonly (string | Buffer)[]) {
  const waits: number[] = [];
  let at = 0;
  const source: StdinSource = {
    read: (buffer) => {
      const step = steps[at];
      at += 1;
      if (step === undefined) return 0;
      if (step === 'EAGAIN') throw again();
      return (typeof step === 'string' ? Buffer.from(step, 'utf8') : step).copy(buffer);
    },
    wait: (ms) => waits.push(ms),
  };
  return { source, waits };
}

describe('readStdin', () => {
  it('keeps what it read before EAGAIN and reads the rest after it (PR #76)', () => {
    const { source, waits } = pipe(['{"hook_event_name":', 'EAGAIN', 'EAGAIN', '"PreToolUse"}']);
    expect(readStdin(source)).toBe('{"hook_event_name":"PreToolUse"}');
    expect(waits).toEqual([1, 1]);
  });

  it('reads an empty stdin as an empty string, and EAGAIN before any byte as a wait', () => {
    expect(readStdin(pipe([]).source)).toBe('');
    expect(readStdin(pipe(['EAGAIN', '{}']).source)).toBe('{}');
  });

  it('decodes a character split between two reads', () => {
    const bytes = Buffer.from('"Thả quái"', 'utf8');
    const cut = bytes.indexOf(Buffer.from('ả', 'utf8')) + 1;
    expect(readStdin(pipe([bytes.subarray(0, cut), 'EAGAIN', bytes.subarray(cut)]).source)).toBe(
      '"Thả quái"',
    );
  });

  it('copies each chunk out of the buffer it reuses', () => {
    expect(readStdin(pipe(['aaaa', 'bb']).source)).toBe('aaaabb');
  });

  it('waits on fd 0 without a timer or a stream', () => {
    const started = performance.now();
    FD_0.wait(5);
    expect(performance.now() - started).toBeGreaterThanOrEqual(4);
  });

  it('throws any other read error', () => {
    const source: StdinSource = {
      read: () => {
        throw Object.assign(new Error('EBADF'), { code: 'EBADF' });
      },
      wait: () => undefined,
    };
    expect(() => readStdin(source)).toThrow('EBADF');
  });
});
