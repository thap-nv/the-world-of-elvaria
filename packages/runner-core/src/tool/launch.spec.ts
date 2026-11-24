import { describe, expect, it } from 'vitest';

import { programOf, toolVersionOf } from './launch.ts';

describe('programOf', () => {
  it('starts the command with its arguments first', () => {
    expect(programOf({ command: '/usr/bin/node', args: ['fake.mjs'] })).toEqual({
      file: '/usr/bin/node',
      args: ['fake.mjs'],
    });
  });
});

describe('toolVersionOf', () => {
  it('reads the version a CLI prints, with its pre-release part', () => {
    expect(toolVersionOf('codex-cli 0.167.0-alpha.4.1\n')).toBe('0.167.0-alpha.4.1');
    expect(toolVersionOf('1.5.2\n')).toBe('1.5.2');
    expect(toolVersionOf('nothing')).toBeUndefined();
  });
});
