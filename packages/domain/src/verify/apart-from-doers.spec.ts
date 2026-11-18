// Another family than every doer (ADR 0008): the one test selectVerifier and the delegation of the seal (PS-08b) share.
import { describe, expect, it } from 'vitest';

import { apartFromDoers } from './apart-from-doers.ts';
import type { TribeId } from '../core/ids.ts';

const CLAUDE = 'claude' as TribeId;
const GEMINI = 'gemini' as TribeId;
const FLINT = 'flint' as TribeId;
const sonnet = { tribe: CLAUDE, model: 'claude-sonnet-5-5' };
const opus = { tribe: CLAUDE, model: 'claude-opus-5-5' };
const argon = { tribe: GEMINI, model: 'gemini-4-argon-medium' };

describe('apartFromDoers', () => {
  it('is apart from doers of another family only', () => {
    expect(apartFromDoers(argon, [sonnet, opus])).toBe(true);
    expect(apartFromDoers(opus, [sonnet])).toBe(false);
    expect(apartFromDoers(argon, [sonnet, argon])).toBe(false);
  });

  it('is apart with nobody to compare with: the machine did the work', () => {
    expect(apartFromDoers(sonnet, [])).toBe(true);
  });

  it('counts an unknown family as the same, on either side', () => {
    const models = { [FLINT]: [{ id: 'auto' }] };
    const unknown = { tribe: FLINT, model: 'auto' };
    expect(apartFromDoers(unknown, [sonnet], models)).toBe(false);
    expect(apartFromDoers(argon, [unknown], models)).toBe(false);
  });

  it("reads a family from the models a tribe declares (PS-23), not the slug's", () => {
    const models = { [FLINT]: [{ id: 'swift', family: 'gemini' }] };
    expect(apartFromDoers({ tribe: FLINT, model: 'swift' }, [argon], models)).toBe(false);
    expect(apartFromDoers({ tribe: FLINT, model: 'swift' }, [sonnet], models)).toBe(true);
  });
});
