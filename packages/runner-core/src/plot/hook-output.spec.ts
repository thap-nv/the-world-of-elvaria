import { describe, expect, it } from 'vitest';

import { HEAD_LINES, LINE_CHARS, hookOutputHead } from './hook-output.ts';

describe('hookOutputHead', () => {
  it('keeps five lines and counts errors throughout 300 lines', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `${i} ${i % 2 === 0 ? 'Error' : 'ERROR'}`);
    expect(hookOutputHead(`${lines.join('\n')}\n`)).toEqual({
      lines: lines.slice(0, HEAD_LINES),
      errors: 300,
      total_lines: 300,
    });
  });

  it.each([
    ['', [], 0],
    ['\n\n', [], 0],
    ['\nfirst\r\n\r\nsecond\n', ['first', 'second'], 4],
    ['\u001b[31mError\u001b[0m\nERROR\nwarning\n', ['Error', 'ERROR', 'warning'], 3],
    ['word '.repeat(50), [`${'word '.repeat(40).trimEnd()}…`], 1],
    ['x'.repeat(300), [`${'x'.repeat(LINE_CHARS)}…`], 1],
    [`${'x'.repeat(199)}😀${'y'.repeat(100)}`, [`${'x'.repeat(199)}😀…`], 1],
  ])('summarizes %j', (output, lines, total) => {
    const head = hookOutputHead(output);
    expect(head.lines).toEqual(lines);
    expect(head.total_lines).toBe(total);
    expect(head.errors).toBe(output.includes('Error') ? 2 : 0);
  });
});
