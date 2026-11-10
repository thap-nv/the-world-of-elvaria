// The suite every adapter passes (implementation-plan §3.14): here against fake-agy.mjs, which runs the hooks
// Elvaria declares the way agy 1.5.2 does (cmd /c or sh -c, cwd .agents/), and with them the real hook from
// its source. So `forbidden_command` is refused by the hook's laws, through the generated shim and policy.json.
import { describe, expect, it } from 'vitest';

import { conformanceChecks } from '@elvaria/runner-core';
import type { ConformanceTarget } from '@elvaria/runner-core';

import { fakeRunner, minimalEnv } from './__fixtures__/agy.ts';
import { ANTIGRAVITY_CAPABILITIES } from './runner.ts';

it('declares PowerShell as its shell on Windows only, where the spike measured it (P1-40)', () => {
  expect(ANTIGRAVITY_CAPABILITIES.shell).toEqual({ win32: 'Windows PowerShell (powershell.exe)' });
});

const target: ConformanceTarget = {
  name: 'antigravity (fake-agy.mjs)',
  createRunner: () => fakeRunner(),
  model: 'gemini-3.8-flash-low',
  env: minimalEnv(),
  // Each session starts Node four times (version, /hooks, the session) plus a hook per event.
  timeout_ms: 45_000,
};

describe('conformance suite: antigravity with fake-agy', () => {
  for (const check of conformanceChecks(target)) {
    it(check.id, async () => {
      expect(await check.run(target)).toBe('passed');
    });
  }
});
