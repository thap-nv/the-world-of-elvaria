import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { watchLoop } from './loop.ts';
import type { WatchRuntime } from './loop.ts';

describe('watch loop', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function fixture(isTTY = true) {
    const signals = new EventEmitter();
    const output: string[] = [];
    const runtime: WatchRuntime = {
      isTTY,
      setInterval: (refresh, ms) => setInterval(refresh, ms),
      clearInterval: (timer) => {
        clearInterval(timer);
      },
      onInterrupt: (stop) => {
        signals.on('SIGINT', stop);
      },
      offInterrupt: (stop) => {
        signals.off('SIGINT', stop);
      },
      now: () => Date.now(),
    };
    return { runtime, signals, output, out: (text: string) => output.push(text) };
  }

  it('prints once without ANSI, timers or signal listeners for non-TTY output', async () => {
    const f = fixture(false);
    await watchLoop(() => Promise.resolve('board'), f.out, 5000, f.runtime);
    await vi.advanceTimersByTimeAsync(15000);
    expect(f.output).toEqual(['board']);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.signals.listenerCount('SIGINT')).toBe(0);
  });

  it('refreshes at the chosen interval and removes its timer and SIGINT listener', async () => {
    const f = fixture();
    let board = 'first';
    const running = watchLoop(() => Promise.resolve(board), f.out, 2000, f.runtime);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.output).toEqual(['\u001b[2J\u001b[Hfirst']);
    board = 'changed';
    await vi.advanceTimersByTimeAsync(1999);
    expect(f.output).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.output).toEqual(['\u001b[2J\u001b[Hfirst', '\u001b[2J\u001b[Hchanged']);
    f.signals.emit('SIGINT');
    await running;
    expect(vi.getTimerCount()).toBe(0);
    expect(f.signals.listenerCount('SIGINT')).toBe(0);
    await vi.advanceTimersByTimeAsync(6000);
    expect(f.output).toHaveLength(2);
  });

  it('does not overlap reads or print a read that finishes after SIGINT', async () => {
    const f = fixture();
    let finish: (text: string) => void = () => {
      throw new Error('read has not started');
    };
    let reads = 0;
    const running = watchLoop(
      () => {
        reads += 1;
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      },
      f.out,
      1000,
      f.runtime,
    );
    await vi.advanceTimersByTimeAsync(3000);
    f.signals.emit('SIGINT');
    finish('late');
    await running;
    expect(reads).toBe(1);
    expect(f.output).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.signals.listenerCount('SIGINT')).toBe(0);
  });

  it('cleans up after a failed refresh', async () => {
    const f = fixture();
    const running = watchLoop(() => Promise.reject(new Error('read failed')), f.out, 1000, f.runtime);
    await expect(running).rejects.toThrow('read failed');
    expect(f.output).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.signals.listenerCount('SIGINT')).toBe(0);
  });
});
