import { EVENT_TYPES } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { renderEvents, typeOf } from './docs-events.mjs';

describe('typeOf', () => {
  it('summarizes constants, enums and unions', () => {
    expect(typeOf({ const: 1 })).toBe('`1`');
    expect(typeOf({ enum: ['five_hour', 'weekly'] })).toBe('một trong `five_hour`, `weekly`');
    expect(typeOf({ type: ['string', 'null'] })).toBe('string hoặc null');
  });

  it('summarizes strings by format, pattern, length and excluded values', () => {
    expect(typeOf({ type: 'string' })).toBe('string');
    expect(typeOf({ type: 'string', format: 'date-time' })).toBe('string (date-time)');
    expect(typeOf({ type: 'string', pattern: '^a|b$', minLength: 1, not: { enum: ['global'] } })).toBe(
      'string (khớp `^a|b$`, không rỗng, khác `global`)',
    );
  });

  it('summarizes numbers by range', () => {
    expect(typeOf({ type: 'integer' })).toBe('integer');
    expect(typeOf({ type: 'integer', minimum: 0 })).toBe('integer ≥ 0');
    expect(typeOf({ type: 'number', minimum: 0, maximum: 100 })).toBe('number 0–100');
    expect(typeOf({ type: 'number', maximum: 5 })).toBe('number ≤ 5');
  });

  it('summarizes objects by their fields and arrays by their items', () => {
    const usage = { type: 'object', required: ['tokens'], properties: { tokens: {}, turns: {} } };
    expect(typeOf(usage)).toBe('object { tokens, turns? }');
    expect(typeOf({ type: 'object' })).toBe('object');
    expect(typeOf({ type: 'array', items: { type: 'string' } })).toBe('array of string');
  });

  it('falls back to the type name, or to "any" when there is none', () => {
    expect(typeOf({ type: 'boolean' })).toBe('boolean');
    expect(typeOf({})).toBe('bất kỳ');
    expect(typeOf(true)).toBe('bất kỳ');
  });
});

describe('renderEvents', () => {
  const text = renderEvents();

  it('lists every type of the v1 catalogue once, under its group', () => {
    for (const type of EVENT_TYPES) expect(text.split(`| \`${type}\` |`)).toHaveLength(2);
    expect(text).toContain('\n## `quest` · 17 type\n');
    expect(text).toContain('\n## `sandbox` · 2 type\n');
  });

  it('describes the envelope and the data of the types that have a schema', () => {
    expect(text).toContain('| `actor` | có | object { kind, id? } | |');
    expect(text).toContain('| `mana.level` | `tribe`: string');
    expect(text).toContain('`resets_at` (tùy chọn): string (date-time)');
    expect(text).toContain('| `command.rejected` | `command_id`: string');
    expect(text).toContain('| `quest.done` | `quest`: object { id, title, kind, rank,');
    expect(text).toContain('| `verdict.fail` | object mở, chưa có schema |');
  });

  it('links to the contract and the glossary', () => {
    expect(text).toContain('[schemas/event.schema.json](schemas/event.schema.json)');
    expect(text).toContain('[glossary.md](glossary.md)');
  });
});
