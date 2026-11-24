// A CLI's JSON read without trusting its shape: a field of the wrong type reads as absent, never throws.
import { describe, expect, it } from 'vitest';

import { isJsonObject, numberOf, objectOf, objectsOf, parseJsonLine, textOf } from './json.ts';

const LINE = {
  text: 'hi',
  count: 3,
  inf: Number.POSITIVE_INFINITY,
  inner: { a: 1 },
  list: [{ b: 2 }, 3, null],
};

describe('the accessors', () => {
  it('read a field of the right type', () => {
    expect(textOf(LINE, 'text')).toBe('hi');
    expect(numberOf(LINE, 'count')).toBe(3);
    expect(objectOf(LINE, 'inner')).toEqual({ a: 1 });
    expect(objectsOf(LINE, 'list')).toEqual([{ b: 2 }]);
  });

  it('read a field of another type, a missing one or a missing object as absent', () => {
    expect(textOf(LINE, 'count')).toBeUndefined();
    expect(numberOf(LINE, 'text')).toBeUndefined();
    expect(numberOf(LINE, 'inf')).toBeUndefined();
    expect(objectOf(LINE, 'list')).toBeUndefined();
    expect(objectsOf(LINE, 'inner')).toEqual([]);
    expect(textOf(undefined, 'text')).toBeUndefined();
  });

  it('take an object only: not null, not an array', () => {
    expect(isJsonObject({})).toBe(true);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject('x')).toBe(false);
  });
});

describe('parseJsonLine', () => {
  it('gives an object line as an object and anything else as nothing', () => {
    expect(parseJsonLine('{"type":"init"}')).toEqual({ type: 'init' });
    expect(parseJsonLine('[1]')).toBeUndefined();
    expect(parseJsonLine('')).toBeUndefined();
    expect(parseJsonLine('Reading input from stdin...')).toBeUndefined();
  });
});
