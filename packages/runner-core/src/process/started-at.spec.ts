// processStartOf: what tells a session's process from a later one under the same pid when the Steward restarts.
import { describe, expect, it } from 'vitest';

import { endedPid } from '../__fixtures__/tree.ts';
import { POWERSHELL_TIMEOUT_MS, parseElapsed, processStartOf } from './started-at.ts';

describe('parseElapsed', () => {
  it('reads every form of ps etime', () => {
    expect(parseElapsed('   00:07\n')).toBe(7);
    expect(parseElapsed('12:34')).toBe(754);
    expect(parseElapsed('01:02:03')).toBe(3723);
    expect(parseElapsed('2-01:02:03')).toBe(176_523);
  });

  it('reads nothing else', () => {
    expect(parseElapsed('')).toBeUndefined();
    expect(parseElapsed('ELAPSED')).toBeUndefined();
    expect(parseElapsed('1:2')).toBeUndefined();
  });
});

describe('processStartOf', () => {
  // Windows asks a cold PowerShell, which takes seconds to start on a CI runner (POWERSHELL_TIMEOUT_MS).
  it('finds when this process started, to the second', { timeout: POWERSHELL_TIMEOUT_MS }, async () => {
    const now = Date.now();
    const started = now - process.uptime() * 1000;
    const found = await processStartOf(process.pid, now);
    expect(found).toBeDefined();
    expect(Math.abs((found ?? 0) - started)).toBeLessThan(3000);
  });

  it('knows no start for a process that ended, or for no process at all', async () => {
    expect(await processStartOf(await endedPid())).toBeUndefined();
    expect(await processStartOf(0)).toBeUndefined();
  });
});
