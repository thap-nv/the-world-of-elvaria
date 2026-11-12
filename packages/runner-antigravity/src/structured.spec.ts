// The structured output of an agy run (P1-56, (i) of the P1-50 report): the answer's last JSON object first, and a
// stand-in for notes is no answer.
import { describe, expect, it } from 'vitest';

import { isPlaceholder, lastJsonObject, structuredOf } from './structured.ts';
import type { AgyResult } from './stream.ts';

const result = (response: string, structured?: unknown): AgyResult => ({
  status: 'SUCCESS',
  response,
  ...(structured === undefined ? {} : { structured_output: structured }),
  denied_actions: [],
});

describe('lastJsonObject', () => {
  it('takes the last object of an answer, whatever prose and earlier objects come before it', () => {
    const text =
      'First {"a":1}, then prose with {braces} and\n```json\n{"b":2,"nested":{"c":[1,{"d":3}]}}\n```\nbye';
    expect(lastJsonObject(text)).toEqual({ b: 2, nested: { c: [1, { d: 3 }] } });
  });

  it('reads braces and quotes inside strings as part of the string', () => {
    expect(lastJsonObject('{"notes":"a } and a \\" quote and {","result":"pass"}')).toEqual({
      notes: 'a } and a " quote and {',
      result: 'pass',
    });
  });

  it('skips a block that is not JSON and keeps looking backwards', () => {
    expect(lastJsonObject('{"ok":true} then {not json} and {"also": }')).toEqual({ ok: true });
  });

  it('finds nothing in prose, an array or an unclosed object', () => {
    expect(lastJsonObject('no json here')).toBeUndefined();
    expect(lastJsonObject('')).toBeUndefined();
    expect(lastJsonObject('[1,2,3]')).toBeUndefined();
    expect(lastJsonObject('{"a": 1')).toBeUndefined();
    // A closing brace with nothing open is only a character.
    expect(lastJsonObject('} {"a":1}')).toEqual({ a: 1 });
  });
});

describe('isPlaceholder', () => {
  it('knows a verdict whose notes only hold a place', () => {
    expect(isPlaceholder({ notes: 'placeholder', result: 'pass' })).toBe(true);
    expect(isPlaceholder({ notes: ' Placeholder. ', result: 'pass' })).toBe(true);
    expect(isPlaceholder({ notes: 'TODO', result: 'fail' })).toBe(true);
    expect(isPlaceholder({ notes: 'tbd' })).toBe(true);
    expect(isPlaceholder({ notes: 'n/a' })).toBe(true);
  });

  it('leaves real notes, other shapes and non-objects alone', () => {
    expect(isPlaceholder({ notes: 'Every check read; the break turned e2e red.', result: 'pass' })).toBe(
      false,
    );
    expect(isPlaceholder({ notes: 'the placeholder text in the form is fine', result: 'pass' })).toBe(false);
    expect(isPlaceholder({ result: 'pass' })).toBe(false);
    expect(isPlaceholder({ notes: 7 })).toBe(false);
    expect(isPlaceholder(null)).toBe(false);
    expect(isPlaceholder('placeholder')).toBe(false);
    expect(isPlaceholder(['placeholder'])).toBe(false);
  });
});

describe('structuredOf', () => {
  const real = { notes: 'Read to the end; the break turned e2e red.', result: 'pass' };
  const stand = { notes: 'placeholder', result: 'pass' };

  it('is agy’s own structured_output when the answer holds no JSON of its own', () => {
    expect(structuredOf(result('Done.', real))).toEqual(real);
  });

  it('is the answer’s last JSON, even when agy kept an earlier stand-in (Q5 of P1-50)', () => {
    const response = `${JSON.stringify(stand)}\nmore work\n${JSON.stringify(real)}\n`;
    expect(structuredOf(result(response, stand))).toEqual(real);
  });

  it('falls back to agy’s real output when the last JSON of the answer is a stand-in', () => {
    expect(structuredOf(result(JSON.stringify(stand), real))).toEqual(real);
  });

  it('is nothing when only stand-ins are left, or when there is no result or no answer at all', () => {
    expect(structuredOf(result(JSON.stringify(stand), stand))).toBeUndefined();
    expect(structuredOf(result('no json', stand))).toBeUndefined();
    expect(structuredOf(result('no json'))).toBeUndefined();
    expect(structuredOf(undefined)).toBeUndefined();
  });
});
