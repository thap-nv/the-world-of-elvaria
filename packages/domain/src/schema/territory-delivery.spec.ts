// territory.delivery (PS-08, ADR 0023): optional after v1, `manual` when absent, and a delivery that pushes needs git
// and a remote.
import { describe, expect, it } from 'vitest';

import { DELIVERY_DEFAULTS } from './constants.ts';
import { TerritoryDeliverySchema, deliveryOf } from './territory-delivery.ts';
import { TerritorySchema } from './territory.ts';

const REMOTE = 'https://github.com/owner/repo.git';

const territory = (fields: Record<string, unknown> = {}, vcs: Record<string, unknown> = {}) => ({
  version: 1,
  id: 'elvaria',
  name: 'Elvaria',
  path: 'D:/Dummy/Tool - Personal/elvaria',
  kind: 'code',
  vcs: { type: 'git', default_branch: 'main', remote: REMOTE, ...vcs },
  ...fields,
});

const issuesOf = (value: unknown): string[] =>
  (TerritorySchema.safeParse(value).error?.issues ?? []).map(
    (issue) => `${issue.path.join('.')}: ${issue.message}`,
  );

describe('territory.delivery', () => {
  it('stays absent from a file without it, which then delivers by hand as before PS-08', () => {
    const parsed = TerritorySchema.parse(territory());
    expect(parsed).not.toHaveProperty('delivery');
    expect(deliveryOf(parsed)).toEqual({
      mode: 'manual',
      forge: 'github',
      merge_method: 'merge',
      required_checks: [],
      checks_timeout_minutes: DELIVERY_DEFAULTS.checks_timeout_minutes,
    });
  });

  it('fills every key but the mode the owner chose', () => {
    const parsed = TerritorySchema.parse(territory({ delivery: { mode: 'pr' } }));
    expect(deliveryOf(parsed)).toEqual({
      mode: 'pr',
      forge: 'github',
      merge_method: 'merge',
      required_checks: [],
      checks_timeout_minutes: 60,
    });
  });

  it('reads an empty delivery as manual', () => {
    expect(TerritoryDeliverySchema.parse({}).mode).toBe('manual');
  });

  it('keeps what the owner wrote', () => {
    const delivery = {
      mode: 'pr_merge',
      forge: 'github',
      merge_method: 'squash',
      required_checks: ['ci / check', 'license/cla'],
      checks_timeout_minutes: 90,
    };
    expect(deliveryOf(TerritorySchema.parse(territory({ delivery })))).toEqual(delivery);
  });

  it('hands each reader its own default, so no reader changes another one', () => {
    const first = deliveryOf({});
    first.required_checks.push('ci');
    expect(deliveryOf({}).required_checks).toEqual([]);
  });

  it.each([
    [{ mode: 'auto' }, 'delivery.mode'],
    [{ mode: 'pr', forge: 'gitlab' }, 'delivery.forge'],
    [{ mode: 'pr', merge_method: 'rebase' }, 'delivery.merge_method'],
    [{ mode: 'pr', required_checks: ['ci', 'ci'] }, 'delivery.required_checks'],
    [{ mode: 'pr', required_checks: [''] }, 'delivery.required_checks.0'],
    [{ mode: 'pr', checks_timeout_minutes: 0 }, 'delivery.checks_timeout_minutes'],
    [{ mode: 'pr', remote: 'upstream' }, 'Unrecognized key: "remote"'],
    [{ mode: 'pr', base: 'develop' }, 'Unrecognized key: "base"'],
  ])('refuses %j', (delivery, expected) => {
    expect(issuesOf(territory({ delivery })).join('\n')).toContain(expected);
  });

  describe('a delivery that pushes needs git and a remote', () => {
    const NEEDS = 'delivery.mode: a delivery other than manual needs a git vcs with a remote';

    it.each(['pr', 'pr_merge'])('refuses %s without a remote', (mode) => {
      const value = territory({ delivery: { mode } }, { remote: undefined });
      expect(issuesOf(value)).toEqual([NEEDS]);
    });

    it('refuses pr on a folder without git', () => {
      const value = { ...territory({ delivery: { mode: 'pr' } }), vcs: { type: 'none' } };
      expect(issuesOf(value)).toEqual([NEEDS]);
    });

    it('lets manual stand anywhere, written or not', () => {
      expect(issuesOf({ ...territory({ delivery: { mode: 'manual' } }), vcs: { type: 'none' } })).toEqual([]);
      expect(issuesOf(territory({}, { remote: undefined }))).toEqual([]);
    });
  });
});
