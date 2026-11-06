import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { DIST_CONDITION, HOOK_SCRIPT, hookCommand } from './index.ts';

describe('hookCommand', () => {
  it('runs the built hook with the Node of Elvaria, under the condition that loads built JS', () => {
    expect(hookCommand()).toEqual({
      command: process.execPath,
      args: ['--conditions=elvaria-dist', HOOK_SCRIPT],
    });
    expect(DIST_CONDITION).toBe('elvaria-dist');
  });

  it('passes the run policy file', () => {
    const policy = path.join('C:', 'kingdom', '.runs', 'q_20261106_7k3m2a-1', 'policy.json');
    expect(hookCommand(policy).args.slice(-2)).toEqual(['--policy', policy]);
  });

  it('points at dist/elvaria-hook.js of this package', () => {
    expect(HOOK_SCRIPT.split(path.sep).slice(-3)).toEqual(['hooks', 'dist', 'elvaria-hook.js']);
  });
});
