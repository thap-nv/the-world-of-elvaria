// How an agy run ended: every row of spike P1-12a §5, and the quota error agy's changelog describes.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FIXTURES } from './__fixtures__/agy.ts';
import { agyErrorOf, outcomeOf, rateLimitOf, resetsAtOf } from './outcome.ts';
import type { Ending } from './outcome.ts';
import type { AgyResult } from './stream.ts';

const stderrOf = (name: string): string => readFileSync(path.join(FIXTURES, name), 'utf8');

const done: AgyResult = { status: 'SUCCESS', response: 'ok\n', denied_actions: [] };
const ending = (fields: Partial<Ending> = {}): Ending => ({
  exit_code: 0,
  result: done,
  error: undefined,
  stopped: undefined,
  rate_limited: false,
  ...fields,
});

describe('agyErrorOf', () => {
  it('reads the AGY_ERROR line of a print timeout', () => {
    expect(agyErrorOf(stderrOf('stream-print-timeout.stderr.txt'))).toMatchObject({
      status: 'DEADLINE_EXCEEDED',
      reason: 'print_timeout',
      retryable: false,
    });
  });

  it('keeps a line that is not JSON as text, and finds none in a plain stderr', () => {
    expect(agyErrorOf('AGY_ERROR: boom')).toEqual({ short_error: 'boom' });
    expect(agyErrorOf('AGY_ERROR: 42')).toBeUndefined();
    expect(agyErrorOf(stderrOf('stream-soft-deny-ends-run.stderr.txt'))).toBeUndefined();
  });
});

describe('rateLimitOf', () => {
  it('reads a quota in the constructed AGY_ERROR (changelog wording, not yet seen live)', () => {
    const error = agyErrorOf(stderrOf('constructed-rate-limit.stderr.txt'));
    expect(rateLimitOf(error, undefined)).toMatch(/^You have exhausted your capacity/);
  });

  it('reads the quota error agy 1.5.3 printed when a pool ran dry (P1-16), worded unlike the changelog', () => {
    const error = agyErrorOf(stderrOf('stream-quota-exhausted.stderr.txt'));
    expect(error).toMatchObject({ status: 'RESOURCE_EXHAUSTED', retryable: true });
    expect(rateLimitOf(error, undefined)).toMatch(
      /^RESOURCE_EXHAUSTED \(code 429\): Individual quota reached/,
    );
  });

  it('reads the reset a quota error names, in whole or in part, and none where it names none (P1-22)', () => {
    const now = Date.parse('2026-11-08T01:07:42Z');
    expect(resetsAtOf(stderrOf('stream-quota-exhausted.stderr.txt'), now)).toBe('2026-11-08T06:01:36.000Z');
    expect(resetsAtOf('quota reached. Resets in 12m.', now)).toBe('2026-11-08T01:19:42.000Z');
    expect(resetsAtOf('quota reached. Resets in 2h', now)).toBe('2026-11-08T03:07:42.000Z');
    expect(resetsAtOf('quota reached. Resets in 9s', now)).toBe('2026-11-08T01:07:51.000Z');
    expect(resetsAtOf('quota reached. Resets in soon', now)).toBeUndefined();
    expect(resetsAtOf(stderrOf('constructed-rate-limit.stderr.txt'), now)).toBe('2026-11-08T03:38:54.000Z');
  });

  it('reads one in the result error alone, and none in a print timeout', () => {
    const result: AgyResult = { ...done, status: 'ERROR', error: 'RESOURCE_EXHAUSTED: quota exceeded' };
    expect(rateLimitOf(undefined, result)).toBe('RESOURCE_EXHAUSTED: quota exceeded');
    expect(rateLimitOf(agyErrorOf(stderrOf('stream-print-timeout.stderr.txt')), undefined)).toBeUndefined();
  });
});

describe('outcomeOf', () => {
  it.each<[string, Partial<Ending>, string]>([
    ['a run that answered', {}, 'completed'],
    [
      'a structured answer without text',
      { result: { ...done, response: '', structured_output: {} } },
      'completed',
    ],
    [
      'a soft-deny: SUCCESS, denied actions, exit 0',
      { result: { ...done, denied_actions: [{ action: 'command', display_name: 'RunCommand' }] } },
      'error',
    ],
    ['SUCCESS with nothing produced', { result: { ...done, response: ' \n' } }, 'error'],
    ['exit 1 before any result', { exit_code: 1, result: undefined }, 'error'],
    ['exit 3 with status ERROR', { exit_code: 3, result: { ...done, status: 'ERROR' } }, 'error'],
    [
      'a print timeout',
      { exit_code: 3, result: { ...done, status: 'ERROR', finished_reason: 'print_timeout' } },
      'budget',
    ],
    [
      'a print timeout seen on stderr only',
      { exit_code: 3, result: undefined, error: { reason: 'print_timeout' } },
      'budget',
    ],
    ['a rate limit', { exit_code: 3, rate_limited: true }, 'error'],
    ['a kill', { exit_code: null, stopped: 'killed' }, 'killed'],
    ['the turn breaker', { exit_code: null, stopped: 'max_turns' }, 'max_turns'],
  ])('%s → %s', (_, fields, outcome) => {
    expect(outcomeOf(ending(fields))).toBe(outcome);
  });
});
