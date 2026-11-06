import { describe, expect, it } from 'vitest';

import {
  CharacterIdSchema,
  QuestIdSchema,
  ScriptIdSchema,
  TagIdSchema,
  UlidSchema,
  VerdictIdSchema,
} from './ids.ts';
import { err, ok } from './result.ts';

describe('branded ids', () => {
  it.each([
    [QuestIdSchema, 'q_20261106_7k3m2a', ['q_20261106_7K3M2A', 'q_20261106_7k3m2i', 'q_2026116_7k3m2a']],
    [VerdictIdSchema, 'q_20261106_7k3m2a-2', ['q_20261106_7k3m2a-0', 'q_20261106_7k3m2a']],
    [UlidSchema, '01JCF8X4Z6Q3W9N2M5R7T8V0YB', ['01jcf8x4z6q3w9n2m5r7t8v0yb', '01JCF8X4Z6Q3W9N2M5R7T8V0YU']],
    [CharacterIdSchema, 'dc1-se-team', ['-thorn', 'thorn-', 'Thorn', 'a'.repeat(33)]],
    [TagIdSchema, 'i18n', ['front-end', 'Frontend', '1db']],
    [ScriptIdSchema, 'link-check', ['link_check', 'Link-check']],
  ])('accepts the documented form and rejects near misses', (schema, good, bad) => {
    expect(schema.safeParse(good).success).toBe(true);
    for (const value of bad) expect(schema.safeParse(value).success).toBe(false);
  });
});

describe('Result', () => {
  it('carries either a value or an error', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(err('nope')).toEqual({ ok: false, error: 'nope' });
  });
});
