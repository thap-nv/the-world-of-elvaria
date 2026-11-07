import { mkdir, readdir, rm, utimes } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { tempKingdom } from '../../test/kingdom.ts';
import { STALE_MS, acquireLock, isLocked, withLock } from './lock.ts';
import type { TempKingdom } from '../../test/kingdom.ts';

// The shortest stale time proper-lockfile accepts; it then refreshes (and notices a loss) every second.
const QUICK = { wait: true, staleMs: 2000 } as const;

let kingdom: TempKingdom;
let target: string;
beforeEach(async () => {
  kingdom = await tempKingdom();
  target = path.join(kingdom.root, '.state', 'steward.lock');
});
afterEach(() => kingdom.remove());

describe('acquireLock (ADR 0004, 0015)', () => {
  it('locks a file that does not exist yet, and frees it on release', async () => {
    const held = await acquireLock(target, { wait: false });
    if (!held.ok) throw new Error('lock not taken');
    expect(await acquireLock(target, { wait: false })).toEqual({ ok: false, error: 'locked' });
    await held.value.release();
    const again = await acquireLock(target, { wait: false });
    expect(again.ok).toBe(true);
    if (again.ok) await again.value.release();
  });

  it('takes over a lock its holder stopped refreshing (a crashed Steward)', async () => {
    const lockDir = `${target}.lock`;
    await mkdir(lockDir, { recursive: true });
    const old = new Date(Date.now() - 2 * STALE_MS);
    await utimes(lockDir, old, old);
    const held = await acquireLock(target, { wait: false });
    expect(held.ok).toBe(true);
    if (held.ok) await held.value.release();
  });

  it('isLocked: held while a holder refreshes it, free once released or stale, and never takes it', async () => {
    expect(await isLocked(target)).toBe(false);
    const held = await acquireLock(target, { wait: false });
    if (!held.ok) throw new Error('lock not taken');
    expect(await isLocked(target)).toBe(true);
    await held.value.release();
    expect(await isLocked(target)).toBe(false);
    const lockDir = `${target}.lock`;
    await mkdir(lockDir, { recursive: true });
    const old = new Date(Date.now() - 2 * STALE_MS);
    await utimes(lockDir, old, old);
    expect(await isLocked(target)).toBe(false);
    expect(await readdir(path.dirname(target))).toEqual(['steward.lock.lock']);
  });

  it('records a lock lost while held instead of crashing the process', async () => {
    const held = await acquireLock(target, QUICK);
    if (!held.ok) throw new Error('lock not taken');
    expect(held.value.compromised()).toBeUndefined();
    await rm(`${target}.lock`, { recursive: true });
    await expect.poll(() => held.value.compromised(), { timeout: 5000, interval: 50 }).toBeDefined();
    // Nothing is left to release, and releasing does not throw.
    await held.value.release();
  });
});

describe('withLock', () => {
  it('runs one holder at a time and leaves no lock behind', async () => {
    const trace: string[] = [];
    const step = (name: string, ms: number) =>
      withLock(target, async () => {
        trace.push(`${name}>`);
        await sleep(ms);
        trace.push(`<${name}`);
        return name;
      });
    const results = await Promise.all([step('a', 40), step('b', 10), step('c', 10)]);
    expect(results.map((result) => (result.ok ? result.value : 'locked')).sort()).toEqual(['a', 'b', 'c']);
    // Every entry is followed by its own exit: no two holders overlap.
    for (let index = 0; index < trace.length; index += 2) {
      expect(trace[index + 1]).toBe(`<${trace[index]?.slice(0, -1) ?? ''}`);
    }
    expect(await readdir(path.dirname(target))).toEqual([]);
  });

  it('reports `locked` when the holder keeps the lock past the wait', async () => {
    const held = await acquireLock(target, { wait: false });
    if (!held.ok) throw new Error('lock not taken');
    expect(await withLock(target, () => Promise.resolve(1), { wait: false })).toEqual({
      ok: false,
      error: 'locked',
    });
    await held.value.release();
  });

  it('releases the lock when the action throws', async () => {
    await expect(withLock(target, () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await withLock(target, () => Promise.resolve(1))).toEqual({ ok: true, value: 1 });
  });

  it('fails an action whose lock was lost while it ran', async () => {
    const outcome = withLock(
      target,
      async () => {
        await rm(`${target}.lock`, { recursive: true });
        await sleep(1500);
      },
      QUICK,
    );
    await expect(outcome).rejects.toThrow();
  });
});
