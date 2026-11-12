import { describe, expect, it } from 'vitest';

import { ENVIRONMENT_RECHECK_MINUTES, MS_PER_MINUTE, TERRITORY_DEFAULTS } from '../constants.ts';
import { environmentFailureOf, environmentLineOf, recheckDue } from './environment.ts';
import type { Instant } from '../core/clock.ts';

const DOCKER = TERRITORY_DEFAULTS.environment_errors;

// The lines P1-50 met on dc1 (report §9): an e2e run whose containers another quest's commands.reset removed.
const Q7_E2E = [
  '> dc1@ e2e /plot',
  ' Container dc1-e2e-db-1  Creating',
  'dependency db failed to start: No such container: 3f1c',
  ' ELIFECYCLE  Command failed with exit code 1.',
].join('\n');

describe('environmentLineOf', () => {
  it('gives the line of the log a pattern finds, trimmed, whatever its case', () => {
    expect(environmentLineOf(Q7_E2E, DOCKER)).toBe('dependency db failed to start: No such container: 3f1c');
    expect(environmentLineOf('  container dc1-e2e-api-1 IS UNHEALTHY  \r\nexit 1', DOCKER)).toBe(
      'container dc1-e2e-api-1 IS UNHEALTHY',
    );
    // Windows, Docker Desktop not started yet (Q5 of P1-50).
    const down =
      'error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.47/containers/json"';
    expect(environmentLineOf(`$ docker compose down\n${down}`, DOCKER)).toBe(down);
  });

  it('gives the last such line, nearest the end that failed the command', () => {
    const log = 'service migrate is missing dependency db\nretrying\ncontainer dc1-e2e-api-1 is unhealthy';
    expect(environmentLineOf(log, DOCKER)).toBe('container dc1-e2e-api-1 is unhealthy');
  });

  it('gives nothing for a failing test, nor without patterns', () => {
    expect(environmentLineOf('expected 3 to be 4\n 1 failed', DOCKER)).toBeUndefined();
    expect(environmentLineOf(Q7_E2E, [])).toBeUndefined();
  });
});

describe('environmentFailureOf', () => {
  it('names the first failing check whose environment failed, with its line and log', () => {
    const checks = [
      { id: 'lint', pass: true },
      { id: 'coverage_not_lower', pass: false, log_path: '.runs/q-1/checks/coverage_not_lower.log' },
      { id: 'e2e', pass: false, environment: 'No such container', log_path: '.runs/q-1/checks/e2e.log' },
      { id: 'flake_check', pass: false, environment: 'is unhealthy' },
    ];
    expect(environmentFailureOf(checks)).toEqual({
      check: 'e2e',
      line: 'No such container',
      log_path: '.runs/q-1/checks/e2e.log',
    });
    expect(environmentFailureOf(checks.slice(3))).toEqual({ check: 'flake_check', line: 'is unhealthy' });
  });

  it('names none when every failure is the work, or a passing check carries a line', () => {
    expect(environmentFailureOf([{ id: 'unit', pass: false }])).toBeUndefined();
    expect(
      environmentFailureOf([{ id: 'e2e', pass: true, environment: 'retried: is unhealthy' }]),
    ).toBeUndefined();
    expect(environmentFailureOf([])).toBeUndefined();
  });
});

describe('recheckDue', () => {
  it('runs the checks again ENVIRONMENT_RECHECK_MINUTES after they ended, not before', () => {
    const ended = 1_000_000 as Instant;
    const after = (minutes: number) => (ended + minutes * MS_PER_MINUTE) as Instant;
    expect(recheckDue(ended, after(ENVIRONMENT_RECHECK_MINUTES - 1))).toBe(false);
    expect(recheckDue(ended, after(ENVIRONMENT_RECHECK_MINUTES))).toBe(true);
  });
});
