// The rule of the same tree (RC-03, ADR 0035, plans/recheck.md §2.1): a check is carried when the ledger holds a green
// of the very command it would run, on the very tree, under the same commands, from the same narrow base, at most
// twelve hours old; anything else runs.
import { describe, expect, it } from 'vitest';

import {
  AT,
  BASE_1,
  BASE_2,
  CONFIG,
  OTHER_CONFIG,
  TERRITORY,
  TREE_A,
  TREE_B,
  checkEnd,
  lineId,
  nextLine,
  patrolRan,
} from './__fixtures__/ledger-log.ts';
import { carryOf, checkCommandOf, patrolCarryOf } from './carry.ts';
import { checkLedgerOf } from './ledger.ts';
import type { CarryRequest } from './carry.ts';
import type { Instant } from '../core/clock.ts';
import type { CheckId, TerritoryId } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';

const HOUR = 3_600_000;
const after = (hours: number): Instant => (Date.parse(AT) + hours * HOUR) as Instant;

const TEST = { id: 'test' as CheckId };
const LINT = { id: 'lint' as CheckId, narrow: 'pnpm lint:changed' };

const request = (fields: Partial<CarryRequest> = {}): CarryRequest => ({
  territory: TERRITORY as TerritoryId,
  tree: TREE_A,
  config: CONFIG,
  checks: [TEST, LINT],
  now: after(1),
  ...fields,
});

const carry = (events: readonly Event[], fields: Partial<CarryRequest> = {}) =>
  carryOf(checkLedgerOf(events), request(fields));

describe('carryOf', () => {
  it('carries a check green on the same tree with the same command, from the newest such run', () => {
    const newest = nextLine() + 1;
    const events = [patrolRan([{ id: 'test', pass: true }]), checkEnd([{ id: 'test', pass: true }])];
    expect(carry(events)).toEqual({ run: ['lint'], carried: [{ id: 'test', from: lineId(newest) }] });
  });

  it('runs a check green on another tree, or of another territory', () => {
    const events = [checkEnd([{ id: 'test', pass: true }], { tree: TREE_B })];
    expect(carry(events).run).toEqual(['test', 'lint']);
    expect(
      carry([checkEnd([{ id: 'test', pass: true }])], { territory: 'other' as TerritoryId }).run,
    ).toEqual(['test', 'lint']);
  });

  it('carries nothing to a tree with uncommitted changes', () => {
    expect(carry([checkEnd([{ id: 'test', pass: true }])], { tree: undefined }).carried).toEqual([]);
  });

  it("runs a check green under other commands: the owner's edit of a command or of commands.setup", () => {
    const events = [checkEnd([{ id: 'test', pass: true }], { config: OTHER_CONFIG })];
    expect(carry(events).run).toEqual(['test', 'lint']);
  });

  it('carries a green at twelve hours old and runs it past that', () => {
    const events = [checkEnd([{ id: 'test', pass: true }])];
    expect(carry(events, { now: after(12) }).carried.map(({ id }) => id)).toEqual(['test']);
    expect(carry(events, { now: (after(12) + 1) as Instant }).run).toEqual(['test', 'lint']);
  });

  it('counts the age from the real run, never from a line that carried it', () => {
    const real = nextLine();
    const events = [
      checkEnd([{ id: 'test', pass: true }]),
      checkEnd([{ id: 'test', pass: true, carried_from: lineId(real) }]),
    ];
    expect(carry(events, { now: after(2) }).carried).toEqual([{ id: 'test', from: lineId(real) }]);
    expect(carry(events, { now: after(13) }).run).toEqual(['test', 'lint']);
  });

  it('runs a check that was red, or set aside for its environment, on that tree', () => {
    const red = checkEnd([{ id: 'test', pass: false }]);
    const aside = checkEnd([{ id: 'test', pass: false }], {
      environment: { check: 'test', line: 'Cannot connect to the Docker daemon' },
    });
    expect(carry([red, aside]).run).toEqual(['test', 'lint']);
  });

  it('never carries a green of `run` to a narrow command, nor of a narrow command to `run`', () => {
    const full = checkEnd([{ id: 'lint', pass: true }]);
    const narrow = checkEnd([{ id: 'lint', pass: true }], { mode: 'narrow', base: BASE_1 });
    expect(carry([full], { base: BASE_1 }).run).toEqual(['test', 'lint']);
    expect(carry([narrow]).run).toEqual(['test', 'lint']);
  });

  it('carries a narrow command only to a run from the same base', () => {
    const n = nextLine();
    const narrow = [checkEnd([{ id: 'lint', pass: true }], { mode: 'narrow', base: BASE_1 })];
    expect(carry(narrow, { base: BASE_1 }).carried).toEqual([{ id: 'lint', from: lineId(n) }]);
    expect(carry(narrow, { base: BASE_2 }).run).toEqual(['test', 'lint']);
  });

  it('carries a check with no narrow command between full and narrow runs, whatever their bases: it ran `run`', () => {
    const n = nextLine();
    const narrow = [checkEnd([{ id: 'test', pass: true }], { mode: 'narrow', base: BASE_1 })];
    expect(carry(narrow).carried).toEqual([{ id: 'test', from: lineId(n) }]);
    expect(carry(narrow, { base: BASE_2 }).carried).toEqual([{ id: 'test', from: lineId(n) }]);
  });
});

describe('checkCommandOf', () => {
  it('is the narrow command in a narrow run where the check has one, else `run`', () => {
    expect(checkCommandOf(LINT, true)).toBe('narrow');
    expect(checkCommandOf(LINT, false)).toBe('run');
    expect(checkCommandOf(TEST, true)).toBe('run');
  });
});

describe('patrolCarryOf', () => {
  it('(K4) carries for every trigger but the owner, whose patrol runs every check', () => {
    const events = [checkEnd([{ id: 'test', pass: true }])];
    const ledger = checkLedgerOf(events);
    const carried = [{ id: 'test', from: lineId(nextLine() - 1) }];
    for (const trigger of ['schedule', 'merged', 'base_moved', 'queue'] as const)
      expect(patrolCarryOf(ledger, request(), trigger)).toEqual({ run: ['lint'], carried });
    expect(patrolCarryOf(ledger, request(), 'owner')).toEqual({ run: ['test', 'lint'], carried: [] });
  });
});
