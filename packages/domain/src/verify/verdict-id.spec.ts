import { describe, expect, it } from 'vitest';

import { Q1 } from '../dispatch/__fixtures__/snapshot.ts';
import { reviewed } from './__fixtures__/verdicts.ts';
import { ownerVerdictIdOf, partialVerdictIdOf, verdictIdOf, verifierSessionsOf } from './verdict-id.ts';
describe('verdict ids', () => {
  it("name the run's verdict, a partial of its k-th verifier session, and the owner's", () => {
    expect(verdictIdOf({ id: Q1 }, 2)).toBe(`${Q1}-2`);
    expect(partialVerdictIdOf({ id: Q1 }, 2, 3)).toBe(`${Q1}-2-p3`);
    expect(ownerVerdictIdOf({ id: Q1 }, 2)).toBe(`${Q1}-2-user`);
    expect(verifierSessionsOf(reviewed, 1)).toBe(1);
    expect(verifierSessionsOf(reviewed, 2)).toBe(0);
  });
});
