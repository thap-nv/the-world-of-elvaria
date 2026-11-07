import { describe, expect, it } from 'vitest';

import { descendantsOf, parseProcessTable, readProcessTable } from './process-table.ts';

describe('parseProcessTable and descendantsOf', () => {
  const table = parseProcessTable(
    [
      '    1     0',
      '  100     1',
      '  101   100',
      '  102   100',
      '  200   101',
      '  300     1',
      'garbage',
      '',
    ].join('\n'),
  );

  it('maps each parent to its children, skipping lines of another shape', () => {
    expect(table.get(100)).toEqual([101, 102]);
    expect(table.get(1)).toEqual([100, 300]);
    expect(table.size).toBe(4);
  });

  it('walks every descendant, nearest first, without the roots or repeats', () => {
    expect(descendantsOf(table, [100])).toEqual([101, 102, 200]);
    expect(descendantsOf(table, [100, 101])).toEqual([102, 200]);
    expect(descendantsOf(table, [200])).toEqual([]);
  });
});

describe('readProcessTable', () => {
  it.runIf(process.platform !== 'win32')('sees this process under its parent', async () => {
    expect((await readProcessTable()).get(process.ppid)).toContain(process.pid);
  });
});
