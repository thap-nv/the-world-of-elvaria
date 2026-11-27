import { describe, expect, it } from 'vitest';

import { REGISTRY, TERRITORY } from '../__fixtures__/world.ts';
import { toolPolicyOf } from './tool-policy.ts';

// CM-01 (ADR 0032): the judge of a narrow run runs that run's commands, never a check's whole-tree `run` the narrow
// command stands for, nor a check the run did not select; a territory checked in full gives what it gave before.
describe('the shell of a judge of a narrow run', () => {
  const judge = REGISTRY.classes.find((entry) => entry.id === 'judge')!;
  const [lint, unit, e2e] = TERRITORY.checks;
  const narrowLint = { ...lint!, narrow: 'pnpm lint:changed' };
  const narrowUnit = { ...unit!, narrow: ['pnpm test:changed', 'pnpm coverage:changed'] };
  const territory = { ...TERRITORY, checks: [narrowLint, narrowUnit, e2e!] };
  const policyOf = (role: 'verifier' | 'assignee', narrow?: (typeof territory.checks)[number][]) =>
    toolPolicyOf({ role, characterClass: judge, territory, narrow_checks: narrow });

  it("gets the run's narrow commands, a check without one its run, and no other check's", () => {
    const { allow } = policyOf('verifier', [narrowUnit, { ...lint! }]);
    expect(allow).toEqual(
      expect.arrayContaining([
        'Bash(pnpm test:changed:*)',
        'Bash(pnpm coverage:changed:*)',
        'Bash(pnpm lint:*)',
      ]),
    );
    expect(allow).not.toContain('Bash(pnpm -r test:*)');
    expect(allow).not.toContain('Bash(pnpm e2e:*)');
    expect(allow).not.toContain('Bash(pnpm lint:changed:*)');
  });

  it("keeps the territory's own commands, and gets no check command when the run selected none", () => {
    const { allow } = policyOf('verifier', []);
    expect(allow).toEqual(expect.arrayContaining(['Bash(pnpm test:*)', 'Bash(pnpm typecheck:*)']));
    for (const rule of ['Bash(pnpm test:changed:*)', 'Bash(pnpm lint:changed:*)', 'Bash(pnpm -r test:*)'])
      expect(allow).not.toContain(rule);
  });

  it('gives every check its run as before without a narrow run, and to any session but a judge', () => {
    for (const policy of [policyOf('verifier'), policyOf('assignee', [narrowUnit])]) {
      expect(policy.allow).toContain('Bash(pnpm -r test:*)');
      expect(policy.allow).not.toContain('Bash(pnpm test:changed:*)');
    }
  });

  // CM-08 (ADR 0032 amending ADR 0008): the train runs the test suite after the verdict, so the judge of a deferred
  // territory's narrow run has no commands.test; its lint and typecheck stay, and a full run's judge there keeps it.
  it('loses the test suite in a deferred territory, and keeps it for a run in full there', () => {
    const train = { max_quests: 5, max_wait_minutes: 30 };
    const deferred = { ...territory, check_policy: { mode: 'deferred' as const, full_when: [], train } };
    const allowOf = (narrow?: (typeof territory.checks)[number][]) =>
      toolPolicyOf({ role: 'verifier', characterClass: judge, territory: deferred, narrow_checks: narrow })
        .allow;
    expect(allowOf([narrowUnit])).toEqual(
      expect.arrayContaining(['Bash(pnpm test:changed:*)', 'Bash(pnpm lint:*)', 'Bash(pnpm typecheck:*)']),
    );
    expect(allowOf([narrowUnit])).not.toContain('Bash(pnpm test:*)');
    expect(allowOf()).toContain('Bash(pnpm test:*)');
  });
});
