import { describe, expect, it } from 'vitest';

import { REGISTRY, TERRITORY } from '../__fixtures__/world.ts';
import { toolPolicyOf } from './tool-policy.ts';

// P1-54, (f) of the P1-50 report: after failing checks the judge in its scratch plot reads their logs and waits
// for no lock, so the Steward holds none for it and it runs none of the exclusive checks.
describe('a judge in its scratch plot without the exclusive lock', () => {
  const judge = REGISTRY.classes.find((entry) => entry.id === 'judge')!;

  it('runs no exclusive check when the Steward holds no lock for it, Edit and Write kept', () => {
    const unlocked = toolPolicyOf({
      role: 'verifier',
      characterClass: judge,
      territory: TERRITORY,
      scratch: true,
      exclusive: false,
    });
    expect(unlocked.allow).not.toContain('Bash(pnpm e2e:*)');
    expect(unlocked.tools).toEqual(expect.arrayContaining(['Edit', 'Write']));
  });
});
