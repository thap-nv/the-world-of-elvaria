import { conformanceChecks } from '@elvaria/runner-core';
import { describe, expect, it } from 'vitest';

import { fakeTarget } from './__fixtures__/harness.ts';

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
