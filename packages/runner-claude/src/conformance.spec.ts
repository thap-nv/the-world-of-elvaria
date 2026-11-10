import { conformanceChecks } from '@elvaria/runner-core';
import { describe, expect, it } from 'vitest';

import { fakeTarget } from './__fixtures__/harness.ts';
import { CLAUDE_CAPABILITIES } from './runner.ts';

it('declares Git Bash as its shell on Windows only, where it was measured (P1-40)', () => {
  expect(CLAUDE_CAPABILITIES.shell).toEqual({ win32: 'Git Bash' });
});

// The suite every adapter runs (implementation-plan §3.14), here with the fake CLI, which plays each scenario
// through the real adapter: the run files, the hooks they declare, the stream, the result.
describe('conformance suite: runner-claude with fake-claude.mjs', () => {
  const target = fakeTarget();
  for (const check of conformanceChecks(target)) {
    it(check.id, async () => {
      expect(await check.run(target)).toBe('passed');
    });
  }
});
