// The Herald's log masks every code and session id it has seen (ADR 0031 item 7), and stays bounded under a flood
// of guesses.
import { describe, expect, it } from 'vitest';

import { heraldLog } from './log.ts';
import type { HeraldLogEntry } from './log.ts';

describe('heraldLog', () => {
  it('masks a remembered secret wherever it appears, and nothing else', () => {
    const written: HeraldLogEntry[] = [];
    const log = heraldLog((entry) => written.push(entry));
    log.write({ kind: 'failed', message: 'before s3cr3t-code' });
    log.remember('s3cr3t-code');
    log.remember('');
    log.write({ kind: 'failed', message: 'after s3cr3t-code, again s3cr3t-code' });
    expect(written).toEqual([
      { kind: 'failed', message: 'before s3cr3t-code' },
      { kind: 'failed', message: 'after [redacted], again [redacted]' },
    ]);
  });

  it('forgets the oldest secrets past its bound, and keeps the newest', () => {
    const written: HeraldLogEntry[] = [];
    const log = heraldLog((entry) => written.push(entry));
    for (let index = 0; index <= 256; index += 1) log.remember(`code-${String(index).padStart(4, '0')}`);
    log.remember('code-0256');
    log.write({ kind: 'failed', message: 'code-0000 code-0001 code-0256' });
    expect(written).toEqual([{ kind: 'failed', message: 'code-0000 [redacted] [redacted]' }]);
  });
});
