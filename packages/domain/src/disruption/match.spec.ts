import { describe, expect, it } from 'vitest';

import { codeAt, meetsCondition, valueAt } from './match.ts';

const line = {
  type: 'patrol.ran',
  attempt: 2,
  data: { setup: { pass: false }, checks: [{ id: 'lint' }], head: null },
};

describe('valueAt', () => {
  it('walks a dotted path through objects', () => {
    expect(valueAt(line, 'data.setup.pass')).toBe(false);
    expect(valueAt(line, 'attempt')).toBe(2);
  });

  it('gives nothing for a missing key, a step through null, a primitive or an array', () => {
    expect(valueAt(line, 'data.reason')).toBeUndefined();
    expect(valueAt(line, 'data.head.sha')).toBeUndefined();
    expect(valueAt(line, 'attempt.n')).toBeUndefined();
    expect(valueAt(line, 'data.checks.0')).toBeUndefined();
    expect(valueAt(line, 'type.length')).toBeUndefined();
  });
});

describe('meetsCondition', () => {
  it('in: the value is one of the list, compared strictly', () => {
    expect(meetsCondition(line, { path: 'data.setup.pass', in: [false] })).toBe(true);
    expect(meetsCondition(line, { path: 'attempt', in: ['2'] })).toBe(false);
  });

  it('gte: a number at least the bound; anything else fails', () => {
    expect(meetsCondition(line, { path: 'attempt', gte: 2 })).toBe(true);
    expect(meetsCondition(line, { path: 'attempt', gte: 3 })).toBe(false);
    expect(meetsCondition(line, { path: 'type', gte: 0 })).toBe(false);
  });

  it('exists: a value other than null, or none', () => {
    expect(meetsCondition(line, { path: 'data.setup', exists: true })).toBe(true);
    expect(meetsCondition(line, { path: 'data.head', exists: true })).toBe(false);
    expect(meetsCondition(line, { path: 'data.head', exists: false })).toBe(true);
    expect(meetsCondition(line, { path: 'data.reason', exists: false })).toBe(true);
  });
});

describe('codeAt', () => {
  it('reads a string or a number, nothing else, and nothing without a path', () => {
    expect(codeAt(line, 'type')).toBe('patrol.ran');
    expect(codeAt(line, 'attempt')).toBe('2');
    expect(codeAt(line, 'data.setup')).toBeUndefined();
    expect(codeAt(line, undefined)).toBeUndefined();
  });
});
