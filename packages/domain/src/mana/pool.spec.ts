import { describe, expect, it } from 'vitest';

import { binds, keyOf, namesModel, poolEnabled, poolKeyOf, poolOf, sameKey } from './pool.ts';
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

  it('compares gauges by tribe, pool and the model whose cap it is', () => {
    const key = { tribe: GEMINI.id, pool: 'gemini_models' };
    expect(sameKey(key, { ...key })).toBe(true);
    expect(sameKey(key, { ...key, pool: 'claude_gpt_models' })).toBe(false);
    expect(sameKey(key, { ...key, tribe: CLAUDE.id })).toBe(false);
    expect(sameKey(key, { ...key, model: 'argon' })).toBe(false);
    expect(sameKey({ ...key, model: 'argon' }, { ...key, model: 'argon' })).toBe(true);
  });

  it('keeps only the key of a reading', () => {
    const reading = { ...ARGON_CAP, window: 'weekly', used_pct: 40 };
    expect(keyOf(reading)).toEqual(ARGON_CAP);
    expect(keyOf({ tribe: CLAUDE.id, pool: 'claude' })).toEqual({ tribe: 'claude', pool: 'claude' });
  });
});

const ARGON_CAP = { tribe: GEMINI.id, pool: 'gemini_models', model: 'argon' };
const ARGON = { tribe: GEMINI.id, model: 'gemini-4-argon-medium' };
const FLASH = { tribe: GEMINI.id, model: 'gemini-3.8-flash-high' };
const OPUS = { tribe: GEMINI.id, model: 'claude-opus-5-5-high' };

describe('namesModel', () => {
  it("reads the account's name of a model as words of the slug", () => {
    expect(namesModel('Gemini Flash', FLASH.model)).toBe(true);
    expect(namesModel('GPT-OSS', 'gpt-oss-120b-medium')).toBe(true);
    expect(namesModel('Gemini Pro', FLASH.model)).toBe(false);
    expect(namesModel('Gemini Flash', ARGON.model)).toBe(false);
  });
});

describe('binds', () => {
  const tribes = [CLAUDE, GEMINI];
  const geminiGroup = { tribe: GEMINI.id, pool: 'gemini_models' };

  it("binds a model's own cap to the slugs that name it, in its tribe only", () => {
    expect(binds(tribes, ARGON_CAP, ARGON)).toBe(true);
    expect(binds(tribes, ARGON_CAP, FLASH)).toBe(false);
    expect(binds(tribes, ARGON_CAP, { tribe: CLAUDE.id, model: 'claude-argon-1' })).toBe(false);
  });

  it('binds a group to the models the account lists in it, Argon left out on a Pro plan', () => {
    const listed = { ...geminiGroup, models: ['Gemini Flash', 'Gemini Pro'] };
    expect(binds(tribes, listed, FLASH)).toBe(true);
    expect(binds(tribes, listed, ARGON)).toBe(false);
  });

  it('falls back to the prefix table when the account lists no models', () => {
    expect(binds(tribes, geminiGroup, ARGON)).toBe(true);
    expect(binds(tribes, geminiGroup, OPUS)).toBe(false);
    expect(binds(tribes, { tribe: CLAUDE.id, pool: 'claude' }, { tribe: CLAUDE.id, model: 'x' })).toBe(true);
  });
});
