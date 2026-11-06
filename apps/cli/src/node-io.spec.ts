import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { invocationDir, nodeIo } from './node-io.ts';

describe('invocationDir', () => {
  it('starts relative paths where the owner typed `pnpm elvaria …`', () => {
    expect(invocationDir({ npm_lifecycle_event: 'elvaria', INIT_CWD: '/home/o/kingdoms' }, '/repo')).toBe(
      '/home/o/kingdoms',
    );
  });

  it('ignores INIT_CWD inherited from any other script, and runs from the process folder otherwise', () => {
    expect(invocationDir({ npm_lifecycle_event: 'test', INIT_CWD: '/elsewhere' }, '/repo')).toBe('/repo');
    expect(invocationDir({}, '/repo')).toBe('/repo');
  });
});

describe('nodeIo', () => {
  it('reads the real machine', () => {
    const io = nodeIo();
    expect(io.platform).toBe(process.platform);
    expect(io.nodePath).toBe(process.execPath);
    expect(io.env).toBe(process.env);
    expect(Number.isInteger(io.clock.now())).toBe(true);
    expect(io.random.bytes(10)).toHaveLength(10);
    expect(io.timeZone).not.toBe('');
  });
});
