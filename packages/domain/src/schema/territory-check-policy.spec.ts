// territory.check_policy and checks[].narrow (CM-01, ADR 0032): optional after v1, `full` when absent, `deferred` only
// with a pr_merge delivery by merge commits, and a narrow command written as `run` is.
import { describe, expect, it } from 'vitest';

import { CHECK_POLICY_DEFAULTS } from './constants.ts';
import { checkPolicyOf, defersWhereItCan } from './territory-check-policy.ts';
import { TerritorySchema } from './territory.ts';

const REMOTE = 'https://github.com/owner/repo.git';

const territory = (fields: Record<string, unknown> = {}) => ({
  version: 1,
  id: 'elvaria',
  name: 'Elvaria',
  path: 'D:/Dummy/Tool - Personal/elvaria',
  kind: 'code',
  vcs: { type: 'git', default_branch: 'main', remote: REMOTE },
  ...fields,
});

const TEST = { id: 'test', run: 'pnpm test', when: ['packages/**'], timeout_minutes: 30 };
const PR_MERGE = { mode: 'pr_merge' };

const issuesOf = (value: unknown): string[] =>
  (TerritorySchema.safeParse(value).error?.issues ?? []).map(
    (issue) => `${issue.path.join('.')}: ${issue.message}`,
  );

describe('territory.check_policy', () => {
  it('stays absent from a file without it, which then checks in full as before CM-01', () => {
    const parsed = TerritorySchema.parse(territory());
    expect(parsed).not.toHaveProperty('check_policy');
    expect(checkPolicyOf(parsed)).toEqual({
      mode: 'full',
      full_when: [],
      train: { max_quests: 5, max_wait_minutes: 30 },
    });
  });

  it('fills every key but the mode the owner chose', () => {
    const parsed = TerritorySchema.parse(territory({ check_policy: { mode: 'narrow' } }));
    expect(checkPolicyOf(parsed)).toEqual({
      mode: 'narrow',
      full_when: [],
      train: CHECK_POLICY_DEFAULTS.train,
    });
  });

  it('keeps full_when and the train as written', () => {
    const policy = {
      mode: 'deferred',
      full_when: ['package.json', 'scripts/**'],
      train: { max_quests: 3, max_wait_minutes: 10 },
    };
    const parsed = TerritorySchema.parse(territory({ check_policy: policy, delivery: PR_MERGE }));
    expect(parsed.check_policy).toEqual(policy);
  });

  it.each([
    ['an unknown mode', { mode: 'lazy' }, 'check_policy.mode'],
    ['an empty glob', { full_when: [''] }, 'check_policy.full_when.0'],
    ['a train of no quest', { train: { max_quests: 0 } }, 'check_policy.train.max_quests'],
    ['an unknown key', { only: ['test'] }, 'check_policy: Unrecognized key: "only"'],
  ])('refuses %s', (_name, policy, issue) => {
    expect(issuesOf(territory({ check_policy: policy })).join('\n')).toContain(issue);
  });

  it('defers only on a territory that merges its pull requests by merge commits (the train, CM-08)', () => {
    const deferred = { check_policy: { mode: 'deferred' } };
    const message = 'check_policy.mode: check_policy.mode deferred needs delivery.mode pr_merge';
    expect(issuesOf(territory(deferred)).join('\n')).toContain(message);
    expect(issuesOf(territory({ ...deferred, delivery: { mode: 'pr' } })).join('\n')).toContain(message);
    const squash = { ...deferred, delivery: { ...PR_MERGE, merge_method: 'squash' } };
    expect(issuesOf(territory(squash)).join('\n')).toContain(message);
    expect(issuesOf(territory({ ...deferred, delivery: PR_MERGE }))).toEqual([]);
  });

  it('lets narrow and full stand on any delivery, a folder included', () => {
    expect(defersWhereItCan({ check_policy: checkPolicyOf({}) })).toBe(true);
    const folder = { ...territory({ check_policy: { mode: 'narrow' } }), vcs: { type: 'none' } };
    expect(issuesOf(folder)).toEqual([]);
  });
});

describe('checks[].narrow', () => {
  it('is absent unless written, and takes a command or a list as `run` does', () => {
    const parsed = TerritorySchema.parse(
      territory({
        checks: [TEST, { ...TEST, id: 'lint', narrow: ['pnpm lint:changed', 'pnpm format:changed'] }],
      }),
    );
    expect(parsed.checks[0]).not.toHaveProperty('narrow');
    expect(parsed.checks[1]?.narrow).toEqual(['pnpm lint:changed', 'pnpm format:changed']);
  });

  it('refuses an empty command', () => {
    expect(issuesOf(territory({ checks: [{ ...TEST, narrow: '' }] })).join('\n')).toContain(
      'checks.0.narrow',
    );
  });
});
