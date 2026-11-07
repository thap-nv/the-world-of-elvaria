import { describe, expect, it } from 'vitest';

import { familyOf } from './family.ts';

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
