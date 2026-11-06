import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { contractOf, normalize } from './json-schema.ts';

describe('normalize', () => {
  it('drops the safe-integer bounds zod puts on every integer, and keeps real ones', () => {
    expect(normalize({ type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER })).toEqual({
      type: 'integer',
      minimum: 1,
    });
    expect(normalize({ type: 'integer', minimum: -Number.MAX_SAFE_INTEGER, maximum: 10 })).toEqual({
      type: 'integer',
      maximum: 10,
    });
  });

  it('lets enum and const say the type', () => {
    expect(normalize({ type: 'string', enum: ['a', 'b'] })).toEqual({ enum: ['a', 'b'] });
    expect(normalize({ type: 'number', const: 1 })).toEqual({ const: 1 });
  });

  it('keeps the format and drops the regex zod adds next to it', () => {
    expect(normalize({ type: 'string', format: 'date-time', pattern: '^\\d{4}$' })).toEqual({
      type: 'string',
      format: 'date-time',
    });
  });

  it('writes patterns without the `\\/` escapes of RegExp#source', () => {
    expect(normalize({ type: 'string', pattern: '^prompts\\/[a-z]+\\.md$' })).toEqual({
      type: 'string',
      pattern: '^prompts/[a-z]+\\.md$',
    });
  });

  it('turns `X | null` into one schema with a type list, whichever branch is null', () => {
    const integer = { type: 'integer', minimum: 1 };
    expect(normalize({ default: null, anyOf: [integer, { type: 'null' }] })).toEqual({
      type: ['integer', 'null'],
      minimum: 1,
      default: null,
    });
    expect(normalize({ anyOf: [{ type: 'null' }, { type: 'string' }] })).toEqual({
      type: ['string', 'null'],
    });
  });

  it('leaves other unions alone', () => {
    const twoStrings = { anyOf: [{ type: 'string' }, { type: 'number' }] };
    const nullRef = { anyOf: [{ $ref: '#/$defs/slug' }, { type: 'null' }] };
    const three = { anyOf: [{ type: 'string' }, { type: 'null' }, { type: 'number' }] };
    const one = { anyOf: [{ type: 'string' }] };
    for (const union of [twoStrings, nullRef, three, one]) expect(normalize(union)).toEqual(union);
  });

  it('drops property-name and additional-property keywords that say nothing', () => {
    expect(
      normalize({ type: 'object', propertyNames: { type: 'string' }, additionalProperties: {} }),
    ).toEqual({
      type: 'object',
    });
    expect(
      normalize({
        type: 'object',
        propertyNames: { type: 'string', pattern: '^[a-z]+$' },
        additionalProperties: false,
      }),
    ).toEqual({ type: 'object', propertyNames: { pattern: '^[a-z]+$' }, additionalProperties: false });
    expect(normalize({ propertyNames: false })).toEqual({ propertyNames: false });
  });

  it('orders keywords as a reader expects and follows subschemas, lists and maps of them', () => {
    const tidy = normalize({
      default: 1,
      custom: true,
      description: 'd',
      type: 'integer',
      anyOf: [{ type: 'string', enum: ['x'] }],
      items: { type: 'number', const: 2 },
      $defs: { slug: { type: 'string', enum: ['a'] } },
    }) as Record<string, unknown>;
    expect(Object.keys(tidy)).toEqual([
      'description',
      'type',
      'items',
      'anyOf',
      'default',
      '$defs',
      'custom',
    ]);
    expect(tidy.anyOf).toEqual([{ enum: ['x'] }]);
    expect(tidy.items).toEqual({ const: 2 });
    expect(tidy.$defs).toEqual({ slug: { enum: ['a'] } });
    expect(normalize('plain')).toBe('plain');
  });

  it('keeps field order in `properties`, even for fields named like keywords', () => {
    const tidy = normalize({
      type: 'object',
      properties: { v: { type: 'integer' }, type: { type: 'string' } },
    });
    expect(Object.keys((tidy as { properties: object }).properties)).toEqual(['v', 'type']);
  });

  it('leaves data as written: defaults, consts and examples are not schemas', () => {
    const data = { type: 'string', enum: ['x'], pattern: 'a\\/b' };
    expect(normalize({ default: data, const: data, examples: [data] })).toEqual({
      const: data,
      default: data,
      examples: [data],
    });
  });

  it('leaves a malformed keyword value alone instead of guessing', () => {
    const odd = { pattern: 3, anyOf: 'x', properties: [1] };
    expect(normalize(odd)).toEqual(odd);
  });
});

describe('contractOf', () => {
  it('adds the $schema and $id of the contract and keeps metadata from .meta()', () => {
    const schema = z
      .strictObject({ version: z.literal(1), n: z.int().min(1).optional() })
      .meta({ title: 'T' });
    expect(contractOf('probe', schema)).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://elvaria.dev/schemas/probe/v1',
      title: 'T',
      type: 'object',
      additionalProperties: false,
      required: ['version'],
      properties: { version: { const: 1 }, n: { type: 'integer', minimum: 1 } },
    });
  });
});
