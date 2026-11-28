// LL-04: what stops `elvaria run`, and the reason its Steward's stop line gives, on each OS with a real process.
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { stopReasonOf, untilSignal } from './stop-signal.ts';
import type { SignalSource } from '../upgrade/relaunch.ts';

const FIXTURE = fileURLToPath(new URL('../../fixtures/until-stopped.mjs', import.meta.url));
const WINDOWS = process.platform === 'win32';

/** A child that waits as `elvaria run` does; resolves with its stdout lines and how it ended once it is gone. */
async function stoppedBy(signal: 'SIGINT' | 'SIGTERM') {
  // Node finds its own files without PATH; Windows wants SystemRoot for its sockets.
  const env = WINDOWS ? { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' } : {};
  const child = spawn(process.execPath, [FIXTURE], { cwd: path.dirname(FIXTURE), env, shell: false });
  let out = '';
  const ready = new Promise<void>((resolve) => {
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      if (out.includes('ready\n')) resolve();
    });
  });
  const ended = new Promise<{ code: number | null; killed: string | null }>((resolve) => {
    child.on('exit', (code, killed) => {
      resolve({ code, killed });
    });
  });
  await ready;
  child.kill(signal);
  const end = await ended;
  return { lines: out.trim().split('\n'), ...end };
}

/** Signals a test sends by hand. */
function fakeSignals() {
  const listeners = new Map<string, Set<() => void>>();
  const source: SignalSource = {
    on: (name, listener) => listeners.set(name, (listeners.get(name) ?? new Set()).add(listener)),
    off: (name, listener) => listeners.get(name)?.delete(listener),
  };
  const send = (name: string): void => {
    for (const listener of [...(listeners.get(name) ?? [])]) listener();
  };
  const count = (): number => [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
  return { source, send, count };
}

describe('untilSignal', () => {
  it('resolves with the first signal and listens no more', async () => {
    const signals = fakeSignals();
    const stopped = untilSignal(signals.source);
    expect(signals.count()).toBe(2);
    signals.send('SIGTERM');
    signals.send('SIGINT');
    expect(await stopped).toBe('SIGTERM');
    expect(signals.count()).toBe(0);
  });
});

describe('stopReasonOf', () => {
  it("says owner for Ctrl+C and for a test's io, signal for a SIGTERM", () => {
    expect(stopReasonOf('SIGINT')).toBe('owner');
    expect(stopReasonOf(undefined)).toBe('owner');
    expect(stopReasonOf('SIGTERM')).toBe('signal');
  });
});

describe.runIf(WINDOWS)('on Windows', () => {
  it('a kill runs no handler: the process writes no stop, so the next start says unclean', async () => {
    const ended = await stoppedBy('SIGTERM');
    expect(ended.lines).toEqual(['ready']);
    expect(ended.code).not.toBe(0);
  });
});

describe.runIf(!WINDOWS)('on macOS', () => {
  it('a SIGTERM (kill, or the pinned launcher passing one on) stops it as a signal', async () => {
    expect(await stoppedBy('SIGTERM')).toEqual({ lines: ['ready', 'signal'], code: 0, killed: null });
  });

  it('a SIGINT (Ctrl+C) stops it as the owner', async () => {
    expect(await stoppedBy('SIGINT')).toEqual({ lines: ['ready', 'owner'], code: 0, killed: null });
  });
});
