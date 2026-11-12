// The suite every adapter passes (implementation-plan §3.14): here against fake-codex.mjs, which runs the `-c` hooks
// Elvaria declares the way Codex 0.167 does (PowerShell's `command_windows` on Windows, sh elsewhere; skipped unless
// the trust bypass is given), and with them the real hook from its source. So `forbidden_command` is refused by the
// hook's laws, through policy.json and the Codex dialect of the hook.
import { describe, expect, it } from 'vitest';

import { conformanceChecks } from '@elvaria/runner-core';
import type { ConformanceTarget } from '@elvaria/runner-core';

import { fakeRunner, minimalEnv } from './__fixtures__/codex.ts';
import { CODEX_CAPABILITIES } from './runner.ts';

it('declares PowerShell as its shell on Windows only, where the spike measured it', () => {
  expect(CODEX_CAPABILITIES.shell).toEqual({ win32: 'Windows PowerShell (powershell.exe)' });
  expect(CODEX_CAPABILITIES.search).toBe(false);
});

const target: ConformanceTarget = {
  name: 'codex_cli (fake-codex.mjs)',
  createRunner: () => fakeRunner(),
  model: 'gpt-6-luna-low',
  env: minimalEnv(),
  // Each session starts Node for the app-server check and the session, plus PowerShell and Node per hook.
  timeout_ms: 45_000,
};

describe('conformance suite: codex_cli with fake-codex', () => {
  for (const check of conformanceChecks(target)) {
    it(check.id, async () => {
      expect(await check.run(target)).toBe('passed');
    });
  }
});
