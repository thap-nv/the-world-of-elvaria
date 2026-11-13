import { describe, expect, it } from 'vitest';

import {
  BASE,
  GOOD_GAZETTEER,
  GOOD_LEDGER,
  checkOf,
  ledgerOf,
  stepOf,
  territoryOf,
  trialOf,
} from './__fixtures__/card.ts';
import { SCORECARD_ITEMS } from './constants.ts';
import { territoryScorecardOf } from './scorecard.ts';
import { checkTimeItem, trialItem } from './trial-items.ts';
import type { ScorecardItem } from './reasons.ts';

const codes = (item: ScorecardItem) => item.reasons.map(({ code }) => code);
const fresh = { text: GOOD_GAZETTEER, stamp: BASE, commits_since: 4 };

describe('territoryScorecardOf', () => {
  it('passes every item of a territory that has all it needs, in the order of SCORECARD_ITEMS', () => {
    const card = territoryScorecardOf({
      territory: territoryOf(),
      metrics: GOOD_LEDGER,
      trial: trialOf(),
      gazetteer: fresh,
    });
    expect(card.items.map(({ id }) => id)).toEqual([...SCORECARD_ITEMS]);
    expect(card.items.map(({ status }) => status)).toEqual(SCORECARD_ITEMS.map(() => 'pass'));
    expect(card).toMatchObject({ territory: 'demo', base: BASE.slice(0, 12), ready: true });
  });

  it('is not ready when the trial fails, whatever the other items say', () => {
    const setup = stepOf({ pass: false, exit_code: 1, error_line: 'ERR_PNPM_OUTDATED_LOCKFILE' });
    const card = territoryScorecardOf({
      territory: territoryOf(),
      metrics: GOOD_LEDGER,
      trial: trialOf({ setup, checks: [] }),
      gazetteer: fresh,
    });
    expect(card.ready).toBe(false);
    expect(card.items[0]?.status).toBe('fail');
  });

  it('tries nothing on a territory without git: no base, nothing measured, not ready', () => {
    const card = territoryScorecardOf({
      territory: territoryOf({ vcs: { type: 'none' } }),
      metrics: ledgerOf([]),
      trial: null,
      gazetteer: { text: null },
    });
    expect(card.base).toBeNull();
    expect(card.ready).toBe(false);
    expect(card.items.map(({ status }) => status)).toEqual([
      'unmeasured',
      'unmeasured',
      'unmeasured',
      'fail',
      'pass',
      'unmeasured',
    ]);
  });
});

describe('the trial item', () => {
  it('names the setup and the checks that passed', () => {
    const item = trialItem(territoryOf(), trialOf());
    expect(item.status).toBe('pass');
    expect(item.reasons).toEqual([
      { code: 'setup_passed', params: { command: 'pnpm install --frozen-lockfile', seconds: 41 } },
      { code: 'checks_passed', params: { count: 2 } },
    ]);
  });

  it('says so of a territory without setup or without checks, and passes', () => {
    const bare = territoryOf({ commands: {}, checks: [] });
    const item = trialItem(bare, trialOf({ setup: null, checks: [] }));
    expect(item.status).toBe('pass');
    expect(codes(item)).toEqual(['no_setup', 'no_checks']);
  });

  it('fails a setup with its command, exit code, first error line and log, and runs no check after it', () => {
    const setup = stepOf({ pass: false, exit_code: 3, error_line: 'boom: cannot install' });
    const item = trialItem(territoryOf(), trialOf({ setup, checks: [] }));
    expect(item.status).toBe('fail');
    expect(item.reasons).toEqual([
      {
        code: 'setup_failed',
        params: {
          command: 'pnpm install --frozen-lockfile',
          log: '.runs/trial-demo-setup.log',
          exit: 3,
          line: 'boom: cannot install',
        },
      },
    ]);
  });

  it('marks what a failing step left unsaid with a dash', () => {
    const setup = stepOf({ pass: false, exit_code: null });
    const [reason] = trialItem(territoryOf(), trialOf({ setup, checks: [] })).reasons;
    expect(reason?.params).toMatchObject({ exit: '—', line: '—' });
  });

  it('tells a setup that timed out, and one whose environment failed', () => {
    const late = stepOf({ pass: false, timed_out: true, exit_code: null });
    expect(codes(trialItem(territoryOf(), trialOf({ setup: late, checks: [] })))).toEqual([
      'setup_timed_out',
    ]);
    const docker = stepOf({ pass: false, exit_code: 1, environment: 'Cannot connect to the Docker daemon' });
    const item = trialItem(territoryOf(), trialOf({ setup: docker, checks: [] }));
    expect(item.reasons[0]).toMatchObject({
      code: 'setup_environment',
      params: { line: 'Cannot connect to the Docker daemon' },
    });
  });

  it('names each failing check: failed, timed out, or failed for its environment', () => {
    const checks = [
      checkOf('lint', { pass: false, exit_code: 1, error_line: 'src/a.ts:1 error no-unused-vars' }),
      checkOf('test', { pass: false, timed_out: true, exit_code: null, command: 'pnpm test' }),
      checkOf('e2e', { pass: false, exit_code: 1, environment: 'network e2e_default not found' }),
      checkOf('docs'),
    ];
    const item = trialItem(territoryOf(), trialOf({ checks }));
    expect(item.status).toBe('fail');
    expect(codes(item)).toEqual(['check_failed', 'check_timed_out', 'check_environment', 'setup_passed']);
    expect(item.reasons[0]?.params).toMatchObject({
      check: 'lint',
      command: 'pnpm lint',
      line: 'src/a.ts:1 error no-unused-vars',
    });
    expect(item.reasons[1]?.params).toMatchObject({ check: 'test', command: 'pnpm test' });
  });

  it('fails a trial stopped after its setup, before any check of the territory ran', () => {
    expect(codes(trialItem(territoryOf(), trialOf({ checks: [] })))).toEqual([
      'checks_not_run',
      'setup_passed',
    ]);
  });

  it('fails when no plot could be made, and measures nothing without git', () => {
    const item = trialItem(
      territoryOf(),
      trialOf({ base: null, plot_failure: 'no branch main', setup: null }),
    );
    expect(item).toEqual({
      id: 'trial',
      status: 'fail',
      reasons: [{ code: 'plot_failed', params: { detail: 'no branch main' } }],
    });
    expect(trialItem(territoryOf(), null)).toEqual({
      id: 'trial',
      status: 'unmeasured',
      reasons: [{ code: 'no_git', params: {} }],
    });
  });
});

describe('the check time item', () => {
  it('passes checks within half their timeout, each with its time; fails the one over it', () => {
    const within = checkTimeItem(territoryOf(), trialOf());
    expect(within.status).toBe('pass');
    expect(within.reasons[0]).toEqual({
      code: 'check_time',
      params: { check: 'lint', seconds: 12, minutes: 10 },
    });
    const slow = checkTimeItem(
      territoryOf(),
      trialOf({ checks: [checkOf('lint', { duration_ms: 301_000 })] }),
    );
    expect(slow).toEqual({
      id: 'check_time',
      status: 'fail',
      reasons: [{ code: 'check_slow', params: { check: 'lint', seconds: 301, minutes: 10, max: 50 } }],
    });
  });

  it('has nothing to judge without checks, or when none ran', () => {
    const bare = territoryOf({ checks: [] });
    expect(codes(checkTimeItem(bare, trialOf({ checks: [] })))).toEqual(['no_checks']);
    expect(checkTimeItem(territoryOf(), null).status).toBe('unmeasured');
    expect(codes(checkTimeItem(territoryOf(), trialOf({ checks: [] })))).toEqual(['checks_not_run']);
  });
});
