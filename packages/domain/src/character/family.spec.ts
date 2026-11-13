import { describe, expect, it } from 'vitest';

import { apartFromAll, familyOf, familyOfCharacter } from './family.ts';
import type { TribeId } from '../core/ids.ts';

describe('familyOf', () => {
  it.each([
    ['claude-sonnet-5-5', 'claude'],
    ['claude-opus-5-5-low', 'claude'],
    ['gemini-4-argon-medium', 'gemini'],
    ['gemini-3.8-flash-low', 'gemini'],
    ['gpt-oss-120b-medium', 'gpt'],
    ['codex-mini', 'gpt'],
    ['o3', 'gpt'],
  ])('puts %s in the %s family', (model, family) => {
    expect(familyOf(model)).toBe(family);
  });

  it('gives a model of an unknown maker its first word, so its models share a family', () => {
    expect(familyOf('llama-4-scout')).toBe('llama');
    expect(familyOf('llama-4-maverick')).toBe(familyOf('llama-4-scout'));
    expect(familyOf('mistral')).toBe('mistral');
  });
});

describe('familyOfCharacter', () => {
  const FLINT = 'flint' as TribeId;
  const MODELS = { [FLINT]: [{ id: 'swift', family: 'claude' }, { id: 'auto' }] };

  it('reads the family from the models its tribe declares, whatever the slug says (PS-23)', () => {
    expect(familyOfCharacter({ tribe: FLINT, model: 'swift-high' }, MODELS)).toBe('claude');
  });

  it('knows no family for a model the tribe names without one, or does not name', () => {
    expect(familyOfCharacter({ tribe: FLINT, model: 'auto' }, MODELS)).toBeUndefined();
    expect(familyOfCharacter({ tribe: FLINT, model: 'gemini-4-argon' }, MODELS)).toBeUndefined();
  });

  it('reads the slug for a tribe that declares no models, and without any list', () => {
    const quill = { tribe: 'gemini' as TribeId, model: 'gemini-4-argon-medium' };
    expect(familyOfCharacter(quill, MODELS)).toBe('gemini');
    expect(familyOfCharacter(quill)).toBe('gemini');
  });
});

describe('apartFromAll', () => {
  it('is apart only from families that are all known and all other (ADR 0008)', () => {
    expect(apartFromAll('gemini', ['claude', 'gpt'])).toBe(true);
    expect(apartFromAll('claude', ['claude', 'gpt'])).toBe(false);
    expect(apartFromAll(undefined, ['claude'])).toBe(false);
    expect(apartFromAll('claude', [undefined])).toBe(false);
  });

  it('is apart when there is nobody to compare with', () => {
    expect(apartFromAll(undefined, [])).toBe(true);
  });
});
