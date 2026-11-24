// The breaker of the seal delegation (PS-08g, K11): the suspension folded from its two lines, once per territory until
// the owner resumes it; signal (1), a check turned red with a merge without the seal among its suspects; signal (2),
// the owner's report on such a quest.
import { describe, expect, it } from 'vitest';

import { DOCS, ELVARIA, Q1, Q2, Q3, resumed, suspended } from './__fixtures__/breaker-log.ts';
import { DelegationSchema } from '../schema/delegation.ts';
import {
  baseRedSuspension,
  escapeSuspension,
  lateFailSuspension,
  sealPolicyOf,
  sealSuspendedOf,
  suspendedTerritoriesOf,
} from './breaker.ts';
import type { TerritoryId } from '../core/ids.ts';
import type { RedCheck } from '../patrol/health.ts';
import type { QuestId } from '../core/ids.ts';

const DAY = '2026-11-18T06:30:00+07:00';
const LATER = '2026-11-19T06:30:00+07:00';
const TERRITORY = ELVARIA as TerritoryId;

const red = (check: string, suspects: readonly (readonly [QuestId, boolean])[]): RedCheck => ({
  check,
  since: DAY,
  commit: null,
  log_path: `.runs/patrol-elvaria/checks/${check}.log`,
  suspects: suspects.map(([quest, sealed]) => ({ quest, sealed, ts: DAY })),
});

describe('sealSuspendedOf', () => {
  it('nothing suspended in a log without the two lines', () => {
    expect(sealSuspendedOf([])).toEqual([]);
  });

  it('a territory stays suspended from its line until the owner resumes it, then may be suspended again', () => {
    const once = [suspended(ELVARIA, Q1)];
    expect(sealSuspendedOf(once)).toEqual([
      { territory: ELVARIA, quest: Q1, cause: 'base_red', check: 'unit', since: DAY },
    ]);
    expect(sealSuspendedOf([...once, resumed(ELVARIA)])).toEqual([]);
    const again = [...once, resumed(ELVARIA), suspended(ELVARIA, Q2, LATER, { cause: 'escape_reported' })];
    expect(sealSuspendedOf(again)).toEqual([
      { territory: ELVARIA, quest: Q2, cause: 'escape_reported', since: LATER },
    ]);
  });

  it('a second suspension before a resume keeps the first; each territory apart, by id', () => {
    const events = [
      suspended(ELVARIA, Q1),
      suspended(DOCS, Q3, DAY, { cause: 'escape_reported', note: 'the menu broke' }),
      suspended(ELVARIA, Q2, LATER),
      resumed('zeta'),
    ];
    const found = sealSuspendedOf(events);
    expect(found.map(({ territory, quest }) => [territory, quest])).toEqual([
      [DOCS, Q3],
      [ELVARIA, Q1],
    ]);
    expect(found[0]?.note).toBe('the menu broke');
    expect(suspendedTerritoriesOf(found)).toEqual([DOCS, ELVARIA]);
  });
});

// fix/run-221-followups: the Steward's digest and `elvaria digest` spare the same pull requests.
describe('sealPolicyOf', () => {
  const seal = { max_rank: 'D', kinds: ['fix', 'build'], max_diff_lines: 400 };

  it("the kingdom's delegation of the seal, less the territories suspended and not resumed", () => {
    const kingdom = { delegation: DelegationSchema.parse({ seal }) };
    const events = [suspended(ELVARIA, Q1), suspended(DOCS, Q3), resumed(DOCS)];
    expect(sealPolicyOf(kingdom, sealSuspendedOf(events))).toEqual({ seal, suspended: [ELVARIA] });
  });

  it('no delegation of the seal in a kingdom that names none, and no territory suspended in a quiet log', () => {
    expect(sealPolicyOf({ delegation: DelegationSchema.parse({}) }, [])).toEqual({
      seal: undefined,
      suspended: [],
    });
  });
});

describe('baseRedSuspension', () => {
  it('a check turned red with a merge without the seal among its suspects suspends, blaming the oldest one', () => {
    const turned = [
      red('lint', [[Q1, true]]),
      red('unit', [
        [Q1, true],
        [Q2, false],
        [Q3, false],
      ]),
    ];
    expect(baseRedSuspension(TERRITORY, turned, [])).toEqual({
      territory: ELVARIA,
      quest: Q2,
      cause: 'base_red',
      check: 'unit',
    });
  });

  it('nothing when every suspect had the seal, no suspect, or no check turned red', () => {
    expect(baseRedSuspension(TERRITORY, [red('unit', [[Q1, true]])], [])).toBeUndefined();
    expect(baseRedSuspension(TERRITORY, [red('unit', [])], [])).toBeUndefined();
    expect(baseRedSuspension(TERRITORY, [], [])).toBeUndefined();
  });

  it('nothing while the territory is suspended already; another territory suspended changes nothing', () => {
    const turned = [red('unit', [[Q2, false]])];
    expect(baseRedSuspension(TERRITORY, turned, [{ territory: TERRITORY }])).toBeUndefined();
    expect(baseRedSuspension(TERRITORY, turned, [{ territory: DOCS as TerritoryId }])?.quest).toBe(Q2);
  });
});

describe('escapeSuspension', () => {
  const escape = { quest: Q1, territory: TERRITORY, delegated: true };

  it("the owner's report on a quest merged without the seal suspends its territory, with the owner's note", () => {
    expect(escapeSuspension(escape, [])).toEqual({ territory: ELVARIA, quest: Q1, cause: 'escape_reported' });
    expect(escapeSuspension({ ...escape, note: 'login broke' }, [])).toEqual({
      territory: ELVARIA,
      quest: Q1,
      cause: 'escape_reported',
      note: 'login broke',
    });
  });

  it('nothing for a quest that had the seal, nor while the territory is suspended', () => {
    expect(escapeSuspension({ ...escape, delegated: false }, [])).toBeUndefined();
    expect(escapeSuspension(escape, [{ territory: TERRITORY }])).toBeUndefined();
  });
});

describe('lateFailSuspension', () => {
  const spared = { id: Q2, territory: TERRITORY, seal_required: false, seal_delegated: true } as const;

  it('suspends the territory of a quest the delegation spared, blaming it and naming its first red check', () => {
    expect(lateFailSuspension({ quest: spared, check: 'test' }, [])).toEqual({
      territory: TERRITORY,
      quest: Q2,
      cause: 'late_fail',
      check: 'test',
    });
  });

  it('nothing for a quest with the seal, or spared then raised, nor while the territory is suspended', () => {
    const { seal_delegated: _spared, ...sealed } = spared;
    expect(
      lateFailSuspension({ quest: { ...sealed, seal_required: true }, check: 'test' }, []),
    ).toBeUndefined();
    expect(
      lateFailSuspension({ quest: { ...spared, seal_required: true }, check: 'test' }, []),
    ).toBeUndefined();
    expect(lateFailSuspension({ quest: spared, check: 'test' }, [{ territory: TERRITORY }])).toBeUndefined();
  });
});
