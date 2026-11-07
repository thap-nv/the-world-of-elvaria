import { describe, expect, it } from 'vitest';

import { poolEnabled, poolKeyOf, poolOf, samePool } from './pool.ts';
import type { TribeId } from '../core/ids.ts';

const tribe = (id: string, pools?: Record<string, { enabled: boolean }>) => ({
  id: id as TribeId,
  ...(pools === undefined ? {} : { pools }),
});
const CLAUDE = tribe('claude');
const GEMINI = tribe('gemini', { gemini_models: { enabled: true }, claude_gpt_models: { enabled: false } });

describe('poolOf', () => {
  it('charges a one-pool account to the tribe itself', () => {
    expect(poolOf(CLAUDE, 'claude-opus-5-5')).toBe('claude');
  });

  it("charges an account with several pools to the pool of the character's model", () => {
    expect(poolOf(GEMINI, 'gemini-4-argon-medium')).toBe('gemini_models');
    expect(poolOf(GEMINI, 'claude-opus-5-5-low')).toBe('claude_gpt_models');
    expect(poolOf(GEMINI, 'gpt-6-high')).toBe('claude_gpt_models');
  });

  it('charges a model no named pool claims to the tribe id', () => {
    expect(poolOf(GEMINI, 'llama-5')).toBe('gemini');
    expect(poolOf(tribe('house', { main: { enabled: true } }), 'gemini-4-argon-medium')).toBe('house');
  });
});

describe('poolKeyOf, poolEnabled, samePool', () => {
  it("finds the character's tribe among kingdom.tribes; an unknown tribe is one pool", () => {
    const tribes = [CLAUDE, GEMINI];
    expect(poolKeyOf(tribes, { tribe: GEMINI.id, model: 'gemini-3.8-flash-low' })).toEqual({
      tribe: 'gemini',
      pool: 'gemini_models',
    });
    expect(poolKeyOf(tribes, { tribe: 'codex' as TribeId, model: 'gpt-6' })).toEqual({
      tribe: 'codex',
      pool: 'codex',
    });
  });

  it('closes a named pool the owner turned off, and only that one', () => {
    const tribes = [CLAUDE, GEMINI];
    expect(poolEnabled(tribes, { tribe: GEMINI.id, pool: 'claude_gpt_models' })).toBe(false);
    expect(poolEnabled(tribes, { tribe: GEMINI.id, pool: 'gemini_models' })).toBe(true);
    expect(poolEnabled(tribes, { tribe: GEMINI.id, pool: 'gemini' })).toBe(true);
    expect(poolEnabled(tribes, { tribe: CLAUDE.id, pool: 'claude' })).toBe(true);
  });

  it('compares pools by tribe and name', () => {
    const key = { tribe: GEMINI.id, pool: 'gemini_models' };
    expect(samePool(key, { ...key })).toBe(true);
    expect(samePool(key, { ...key, pool: 'claude_gpt_models' })).toBe(false);
    expect(samePool(key, { ...key, tribe: CLAUDE.id })).toBe(false);
  });
});
