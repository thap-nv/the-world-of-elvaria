// The check ledger from the log (RC-03, ADR 0035): each green check that ran on a named tree under named commands is a
// row; a red check, a check set aside for its environment, a carried check, a line on uncommitted changes and a line
// older than RC-03 are none.
import { describe, expect, it } from 'vitest';

import {
  AT,
  BASE_1,
  CONFIG,
  TERRITORY,
  TREE_A,
  checkEnd,
  lineId,
  nextLine,
  patrolRan,
} from './__fixtures__/ledger-log.ts';
import { checkLedgerOf, ledgerRowsOf } from './ledger.ts';
import { EventSchema } from '../schema/event/event.ts';

const row = (check: string, n: number, extra: Record<string, unknown> = {}) => ({
  territory: TERRITORY,
  check,
  tree: TREE_A,
  config: CONFIG,
  ...extra,
  at: AT,
  source: lineId(n),
});

describe('ledgerRowsOf', () => {
  it("keeps each green check of a `check.end` that ran, with the envelope's territory; a red one is no fact", () => {
    const n = nextLine();
    const line = checkEnd([
      { id: 'lint', pass: true },
      { id: 'test', pass: false },
      { id: 'typecheck', pass: true },
    ]);
    expect(ledgerRowsOf(line)).toEqual([row('lint', n), row('typecheck', n)]);
  });

  it("keeps a narrow run's base on its rows, and none from a narrow line that lost its base", () => {
    const n = nextLine();
    expect(ledgerRowsOf(checkEnd([{ id: 'lint', pass: true }], { mode: 'narrow', base: BASE_1 }))).toEqual([
      row('lint', n, { base: BASE_1 }),
    ]);
    expect(ledgerRowsOf(checkEnd([{ id: 'lint', pass: true }], { mode: 'narrow' }))).toEqual([]);
  });

  it('keeps nothing of a line on uncommitted changes, one without its config, or one with no territory', () => {
    const green = [{ id: 'lint', pass: true }];
    expect(ledgerRowsOf(checkEnd(green, { tree: undefined }))).toEqual([]);
    expect(ledgerRowsOf(checkEnd(green, { config: undefined }))).toEqual([]);
    expect(ledgerRowsOf(checkEnd(green, {}, {}))).toEqual([]);
  });

  it('keeps no carried check: it ran nowhere, and its age counts from the run it stands for', () => {
    const n = nextLine();
    const line = checkEnd([
      { id: 'lint', pass: true, carried_from: lineId(1) },
      { id: 'test', pass: true },
    ]);
    expect(ledgerRowsOf(line)).toEqual([row('test', n)]);
  });

  it('keeps the green checks of a patrol that ran, as runs of `run`; red, set aside or carried ones are none', () => {
    const n = nextLine();
    const line = patrolRan([
      { id: 'lint', pass: true },
      { id: 'test', pass: false },
      { id: 'typecheck', pass: true, carried_from: lineId(1) },
    ]);
    expect(ledgerRowsOf(line)).toEqual([row('lint', n)]);
    const aside = patrolRan([], {
      checks: [
        {
          id: 'e2e',
          pass: false,
          duration_ms: 5,
          timed_out: false,
          environment: true,
          log_path: '.runs/patrol-elvaria/checks/e2e.log',
        },
      ],
    });
    expect(ledgerRowsOf(aside)).toEqual([]);
  });

  it('reads a line older than RC-03, which has no tree and no config, as no fact', () => {
    const old = EventSchema.parse({
      v: 2,
      id: lineId(99),
      ts: AT,
      type: 'check.end',
      actor: { kind: 'steward' },
      territory: TERRITORY,
      data: { outcome: 'pass', checks: [{ id: 'lint', pass: true, duration_ms: 5 }] },
    });
    expect(ledgerRowsOf(old)).toEqual([]);
    expect(
      ledgerRowsOf(patrolRan([{ id: 'lint', pass: true }], { tree: undefined, config: undefined })),
    ).toEqual([]);
  });

  it('keeps nothing of a line of another type', () => {
    const start = EventSchema.parse({
      v: 2,
      id: lineId(98),
      ts: AT,
      type: 'check.start',
      actor: { kind: 'steward' },
      territory: TERRITORY,
      data: {},
    });
    expect(ledgerRowsOf(start)).toEqual([]);
  });
});

describe('checkLedgerOf', () => {
  it('is the rows of every line, in the order of the log', () => {
    const first = nextLine();
    const events = [checkEnd([{ id: 'test', pass: true }]), patrolRan([{ id: 'lint', pass: true }])];
    expect(checkLedgerOf(events)).toEqual([row('test', first), row('lint', first + 1)]);
  });
});
