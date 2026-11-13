import { describe, expect, it } from 'vitest';

import { GOOD_LEDGER, ledgerOf, rowOf, territoryOf } from './__fixtures__/card.ts';
import { firstPassItem, pathsItem, setAsideItem } from './ledger-items.ts';

describe('the set-aside item', () => {
  it("rates the territory's own runs of checks, another territory's left out", () => {
    expect(setAsideItem(territoryOf(), GOOD_LEDGER)).toEqual({
      id: 'set_aside',
      status: 'pass',
      reasons: [{ code: 'set_aside_rate', params: { set_aside: 0, runs: 10, rate: 0, max: 10 } }],
    });
  });

  it('fails when more than a tenth of them were set aside for their environment', () => {
    const item = setAsideItem(territoryOf(), ledgerOf([rowOf('demo', 6, 1), rowOf('demo', 3, 1)]));
    expect(item.status).toBe('fail');
    expect(item.reasons[0]?.params).toMatchObject({ set_aside: 2, runs: 9, rate: 22 });
  });

  it('has nothing to judge before three runs', () => {
    expect(setAsideItem(territoryOf(), ledgerOf([rowOf('demo', 2, 2)]))).toEqual({
      id: 'set_aside',
      status: 'unmeasured',
      reasons: [{ code: 'few_check_runs', params: { runs: 2, min: 3 } }],
    });
  });
});

describe('the paths item', () => {
  it('passes declared lists, empty ones included', () => {
    const item = pathsItem(territoryOf({ shared_paths: [], laws: { protected_paths: [] } }));
    expect(item.status).toBe('pass');
    expect(item.reasons.map(({ params }) => params)).toEqual([{ count: 0 }, { count: 0 }]);
  });

  it('fails each list never declared', () => {
    const { shared_paths: _shared, ...rest } = territoryOf();
    const item = pathsItem({ ...rest, laws: { ...rest.laws, protected_paths: undefined } });
    expect(item.status).toBe('fail');
    expect(item.reasons.map(({ code }) => code)).toEqual(['shared_paths_missing', 'protected_paths_missing']);
  });
});

describe('the first-pass item', () => {
  it("rates the territory's first runs, and fails below one in two", () => {
    expect(firstPassItem(territoryOf(), GOOD_LEDGER)).toEqual({
      id: 'first_pass',
      status: 'pass',
      reasons: [{ code: 'first_pass_rate', params: { passed: 3, decided: 4, rate: 75, min: 50 } }],
    });
    const low = ledgerOf([], [{ key: 'demo', decided: 5, passed: 2 }]);
    expect(firstPassItem(territoryOf(), low).status).toBe('fail');
  });

  it('has nothing to judge before three decided quests, or with none', () => {
    const few = ledgerOf([], [{ key: 'demo', decided: 2, passed: 2 }]);
    expect(firstPassItem(territoryOf(), few).reasons[0]).toEqual({
      code: 'few_decided',
      params: { decided: 2, min: 3 },
    });
    expect(firstPassItem(territoryOf(), ledgerOf([])).status).toBe('unmeasured');
  });
});
