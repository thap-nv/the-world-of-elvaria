// kingdom.heal (ADR 0034): optional, every key defaulted, so a kingdom file written before it stays valid.
import { describe, expect, it } from 'vitest';

import { HealSchema } from './kingdom-heal.ts';

describe('HealSchema', () => {
  it('fills the settled defaults for a kingdom without the key (K3, K4, K8)', () => {
    expect(HealSchema.parse(undefined)).toEqual({
      enabled: true,
      tokens: 150_000,
      minutes: 15,
      max_files: 8,
      max_lines: 60,
    });
  });

  it("keeps the owner's values, a fractional minute included", () => {
    expect(HealSchema.parse({ enabled: false, minutes: 7.5 })).toMatchObject({
      enabled: false,
      minutes: 7.5,
    });
  });

  it('refuses an unknown key, a zero ceiling and fractional limits', () => {
    expect(HealSchema.safeParse({ files: 8 }).success).toBe(false);
    expect(HealSchema.safeParse({ tokens: 0 }).success).toBe(false);
    expect(HealSchema.safeParse({ minutes: 0 }).success).toBe(false);
    expect(HealSchema.safeParse({ max_lines: 60.5 }).success).toBe(false);
  });
});
