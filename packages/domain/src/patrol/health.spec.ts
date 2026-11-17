// The health of a default branch from the log (PS-26): a check turns red once, stays red without a second turn, goes
// back to green; a check that failed for its environment changes nothing; a failed setup is red as `setup`; the
// quests merged since the last green patrol are the suspects of a check that turns red.
import { describe, expect, it } from 'vitest';

import { SHA_B, TERRITORY, merged, ran, ranData } from './__fixtures__/patrol-log.ts';
import {
  EMPTY_PATROL_LEDGER,
  baseHealthOf,
  healthOf,
  patrolLedgerOf,
  redFlipsOf,
  stepPatrol,
} from './health.ts';
import type { QuestId } from '../core/ids.ts';

const Q1 = 'q_20261116_aaaaa1' as QuestId;
const Q2 = 'q_20261116_aaaaa2' as QuestId;
const DAY1 = '2026-11-16T06:30:00+07:00';
const DAY2 = '2026-11-17T06:30:00+07:00';
const DAY3 = '2026-11-18T06:30:00+07:00';
const DAY4 = '2026-11-19T06:30:00+07:00';
const green = { id: 'unit', pass: true };
const red = { id: 'unit', pass: false, error_line: 'FAIL src/a.spec.ts' };

describe('baseHealthOf', () => {
  it('a green branch: the latest patrol, nothing red', () => {
    expect(baseHealthOf([ran(DAY1, [green, { id: 'lint', pass: true }])])).toEqual([
      { territory: TERRITORY, at: DAY1, head: 'a'.repeat(40), red: [], scans: [] },
    ]);
    expect(baseHealthOf([])).toEqual([]);
    const two = baseHealthOf([ran(DAY1, [green], { territory: 'zeta' }), ran(DAY1, [green])]);
    expect(two.map(({ territory }) => territory)).toEqual([TERRITORY, 'zeta']);
  });

  it('a check red stays one red check, from the patrol that first found it, until a patrol finds it green', () => {
    const later = { ...red, error_line: 'FAIL src/b.spec.ts' };
    const events = [ran(DAY1, [green]), ran(DAY2, [red]), ran(DAY3, [later], { head: SHA_B })];
    const [health] = baseHealthOf(events);
    expect(health?.red).toEqual([
      {
        check: 'unit',
        since: DAY2,
        commit: 'a'.repeat(40),
        error_line: 'FAIL src/b.spec.ts',
        log_path: '.runs/patrol-elvaria/checks/unit.log',
        green_at: DAY1,
        suspects: [],
      },
    ]);
    expect(health?.head).toBe(SHA_B);
    expect(redFlipsOf(events)).toHaveLength(1);
    expect(baseHealthOf([...events, ran(DAY4, [green])])[0]?.red).toEqual([]);
  });

  it('names the quests merged between the last green patrol and the red one, sealed or not', () => {
    const events = [
      merged(DAY1, Q2),
      ran(DAY1, [green]),
      merged(DAY2, Q1, false),
      ran(DAY2, [red]),
      merged(DAY3, Q2),
      ran(DAY3, [red]),
    ];
    const [flip] = redFlipsOf(events);
    expect(flip?.territory).toBe(TERRITORY);
    expect(flip?.suspects).toEqual([{ quest: Q1, sealed: false, ts: DAY2 }]);
    expect(baseHealthOf(events)[0]?.red[0]?.suspects).toEqual(flip?.suspects);
  });

  it('a check red at the first patrol has no green patrol and no suspects; a red without an error line has none', () => {
    const [health] = baseHealthOf([merged(DAY1, Q1), ran(DAY2, [{ id: 'unit', pass: false }])]);
    expect(health?.red[0]).toEqual({
      check: 'unit',
      since: DAY2,
      commit: 'a'.repeat(40),
      log_path: '.runs/patrol-elvaria/checks/unit.log',
      suspects: [],
    });
  });

  it('a check set aside for its environment is never red, and leaves a red one red', () => {
    const aside = { id: 'unit', pass: false, environment: true };
    expect(baseHealthOf([ran(DAY1, [green]), ran(DAY2, [aside])])[0]?.red).toEqual([]);
    const still = baseHealthOf([ran(DAY1, [red]), ran(DAY2, [aside])])[0]?.red;
    expect(still?.map(({ check, since }) => ({ check, since }))).toEqual([{ check: 'unit', since: DAY1 }]);
  });

  it('a failed setup is red as `setup`, and the checks it kept from running stay as they were', () => {
    const setup = (pass: boolean) => ({
      setup: {
        pass,
        ...(pass ? {} : { error_line: 'ERR_PNPM' }),
        log_path: '.runs/patrol-elvaria/setup.log',
      },
    });
    const events = [ran(DAY1, [red], setup(true)), ran(DAY2, [], setup(false))];
    expect(baseHealthOf(events)[0]?.red.map(({ check }) => check)).toEqual(['setup', 'unit']);
    expect(redFlipsOf(events).map(({ check }) => check)).toEqual(['unit', 'setup']);
    // The territory drops its setup: a run without one clears it.
    expect(baseHealthOf([...events, ran(DAY3, [green])])[0]?.red).toEqual([]);
  });

  it('a check gone from the territory is no longer red; a run with no plot changes nothing', () => {
    expect(baseHealthOf([ran(DAY1, [red]), ran(DAY2, [{ id: 'lint', pass: true }])])[0]?.red).toEqual([]);
    const events = [ran(DAY1, [red]), ran(DAY2, [], { plot_failure: 'no default branch', head: null })];
    const [health] = baseHealthOf(events);
    expect(health?.red.map(({ check }) => check)).toEqual(['unit']);
    expect(health).toMatchObject({ at: DAY2, head: null });
  });

  it('keeps the scans of the latest patrol that did not pass', () => {
    const scans = [
      { script: 'link-check', outcome: 'fail', count: 3 },
      { script: 'todo-scan', outcome: 'pass', count: 12 },
      { script: 'gone', outcome: 'unknown' },
    ] as const;
    expect(baseHealthOf([ran(DAY1, [green], { scans })])[0]?.scans).toEqual([
      { script: 'link-check', outcome: 'fail', count: 3 },
      { script: 'gone', outcome: 'unknown' },
    ]);
  });

  it('keeps no merge into a territory no patrol found green, nor one of another territory', () => {
    const ledger = patrolLedgerOf([merged(DAY1, Q1), merged(DAY1, Q1, true, 'other'), ran(DAY2, [green])]);
    const step = stepPatrol(ledger, DAY3, ranData([red]));
    expect(step.turned_red[0]?.suspects).toEqual([]);
    expect(healthOf(step.ledger).map(({ territory }) => territory)).toEqual([TERRITORY]);
    expect(stepPatrol(EMPTY_PATROL_LEDGER, DAY1, ranData([red])).turned_red).toHaveLength(1);
    const unseen = patrolLedgerOf([ran(DAY1, [red]), merged(DAY2, Q1), ran(DAY3, [green])]);
    expect(stepPatrol(unseen, DAY4, ranData([red])).turned_red[0]?.suspects).toEqual([]);
  });
});
