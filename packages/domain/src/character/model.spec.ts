import { describe, expect, it } from 'vitest';

import { modelOfTribe, setModelLine, withModel } from './model.ts';
import type { TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';

const CLAUDE = 'claude' as TribeId;
const GEMINI = 'gemini' as TribeId;
const TRIBES = [
  { id: CLAUDE },
  { id: GEMINI, pools: { gemini_models: { enabled: true }, claude_gpt_models: { enabled: false } } },
];
const QUILL = { tribe: GEMINI, model: 'gemini-4-argon-medium' };
const THORN = { tribe: CLAUDE, model: 'claude-opus-5-5' };

describe('modelOfTribe', () => {
  it('lets an account with named pools serve every model some pool claims, a turned-off one too', () => {
    expect(modelOfTribe(TRIBES, QUILL, 'gemini-3.8-flash-high')).toBe(true);
    expect(modelOfTribe(TRIBES, QUILL, 'claude-opus-5-5-high')).toBe(true);
    expect(modelOfTribe(TRIBES, QUILL, 'llama-5')).toBe(false);
  });

  it("keeps a one-pool account, or a tribe kingdom.json does not list, to the family of the character's model", () => {
    expect(modelOfTribe(TRIBES, THORN, 'claude-sonnet-5-5')).toBe(true);
    expect(modelOfTribe(TRIBES, THORN, 'gemini-4-argon-medium')).toBe(false);
    expect(modelOfTribe([], { tribe: 'codex' as TribeId, model: 'gpt-6' }, 'codex-7')).toBe(true);
  });
});

describe('setModelLine', () => {
  it('writes character.model_changed for another model of the tribe', () => {
    expect(setModelLine(QUILL, 'gemini-3.8-flash-high', TRIBES)).toEqual({
      ok: true,
      value: 'character.model_changed',
    });
  });

  it('refuses a slug that is no model, the model it has, a model of another tribe', () => {
    expect(setModelLine(QUILL, 'Gemini Flash', TRIBES)).toEqual({
      ok: false,
      error: { code: 'invalid_model' },
    });
    expect(setModelLine(QUILL, QUILL.model, TRIBES)).toEqual({ ok: false, error: { code: 'same_model' } });
    expect(setModelLine(THORN, 'gpt-oss-120b-medium', TRIBES)).toEqual({
      ok: false,
      error: { code: 'model_not_of_tribe' },
    });
  });

  it('changes only the model', () => {
    const character = { id: 'quill', ...QUILL, level: 3 } as unknown as Character;
    expect(withModel(character, 'gemini-3.8-flash-high')).toEqual({
      ...character,
      model: 'gemini-3.8-flash-high',
    });
  });
});
