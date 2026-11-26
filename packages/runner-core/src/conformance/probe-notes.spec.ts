import { expect, it } from 'vitest';

import { createFakeRunner } from '../runner/fake-runner.ts';
import { CONFORMANCE_CHECKS } from './checks.ts';
import type { ProbeResult } from '../runner/types.ts';

it.each<[ProbeResult, string]>([
  [
    {
      status: 'error',
      note: { code: 'probe:no_answer', params: { request: 'account/rateLimits/read' } },
      cli_text: 'CLI says no',
    },
    'probe:no_answer {"request":"account/rateLimits/read"} CLI says no',
  ],
  [{ status: 'error', note: { code: 'probe:threw', params: {} } }, 'probe:threw {}'],
  [{ status: 'error', cli_text: 'raw CLI text' }, 'raw CLI text'],
  [{ status: 'error' }, 'error'],
])('reports a failed probe without translating its evidence: %j', async (probe, expected) => {
  const check = CONFORMANCE_CHECKS.find(({ id }) => id === 'probe')!;
  await expect(check.run({ name: 'probe', createRunner: () => createFakeRunner({ probe }) })).rejects.toThrow(
    `probe failed: ${expected}`,
  );
});
