import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const WORKSPACE = readFileSync(new URL('../pnpm-workspace.yaml', import.meta.url), 'utf8');

/** Seven days in minutes, the unit of pnpm's `minimumReleaseAge` (SEC-05, threat model B7). */
const SEVEN_DAYS = 7 * 24 * 60;

describe('pnpm-workspace.yaml supply-chain settings', () => {
  it('holds back releases younger than seven days', () => {
    // Most hijacked npm releases are caught within days; a dependency of phase 2 must not land
    // in its first week (plans/phase-2-threat-model.md, B7).
    const age = /^minimumReleaseAge: (\d+)$/m.exec(WORKSPACE)?.[1];
    expect(Number(age)).toBeGreaterThanOrEqual(SEVEN_DAYS);
  });
});
