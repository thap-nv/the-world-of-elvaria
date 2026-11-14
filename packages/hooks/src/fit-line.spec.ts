import { CURRENT_EVENT_VERSION, MAX_LINE_BYTES } from '@elvaria/eventlog';
import { describe, expect, it } from 'vitest';

import { TRUNCATED, fitLine, truncate } from './fit-line.ts';

const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8') + 1;

describe('truncate', () => {
  it('keeps short text and marks cut text', () => {
    expect(truncate('pnpm test', 100)).toBe('pnpm test');
    expect(truncate('abcdef', 3)).toBe(`abc${TRUNCATED}`);
  });

  it('never cuts a surrogate pair in half', () => {
    expect(truncate('ab😀cd', 3)).toBe(`ab${TRUNCATED}`);
    expect(truncate('ab😀cd', 4)).toBe(`ab😀${TRUNCATED}`);
  });
});

describe('fitLine', () => {
  it('leaves an ordinary line as it is', () => {
    const line = {
      v: CURRENT_EVENT_VERSION,
      type: 'agent.tool',
      data: { tool: 'bash', command: 'pnpm test', exit: 1 },
    };
    expect(fitLine(line)).toEqual(line);
  });

  it('cuts a heredoc command to 8192 characters', () => {
    const line = { data: { command: 'x'.repeat(20_000), tool: 'bash' } };
    expect(fitLine(line).data.command).toBe(`${'x'.repeat(8192)}${TRUNCATED}`);
  });

  it('cuts harder until a line of many long strings fits', () => {
    // JSON escapes a control character as \u0001: six bytes each.
    const line = { data: { items: Array.from({ length: 12 }, () => '\u0001'.repeat(9000)) } };
    expect(bytes(line)).toBeGreaterThan(MAX_LINE_BYTES);
    const fitted = fitLine(line);
    expect(bytes(fitted)).toBeLessThanOrEqual(MAX_LINE_BYTES);
    expect(fitted.data.items[0]).toBe(`${'\u0001'.repeat(512)}${TRUNCATED}`);
  });

  it('gives up at the smallest limit; the event log then refuses the line', () => {
    const line = { data: { items: Array.from({ length: 2000 }, () => 'y'.repeat(200)) } };
    expect(bytes(fitLine(line))).toBeGreaterThan(MAX_LINE_BYTES);
  });
});
