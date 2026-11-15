import { describe, expect, it } from 'vitest';

import examples from '../../examples/kingdom.json' with { type: 'json' };
import { KingdomSchema } from './kingdom.ts';

describe('kingdom breaker percentages', () => {
  it('fills defaults on a v1 kingdom written before the new fields', () => {
    const example = KingdomSchema.parse(examples[0]);
    const { soft_pct: _soft, hard_pct: _hard, ...old } = example.breakers;
    const parsed = KingdomSchema.parse({ ...example, breakers: old });
    expect(parsed.version).toBe(1);
    expect(parsed.breakers.soft_pct).toBe(85);
    expect(parsed.breakers.hard_pct).toBe(150);
  });

  it('accepts custom positive percentages, including a hard ceiling above 100 percent', () => {
    const example = KingdomSchema.parse(examples[0]);
    const parsed = KingdomSchema.parse({
      ...example,
      breakers: { ...example.breakers, soft_pct: 75.5, hard_pct: 200 },
    });
    expect(parsed.breakers).toMatchObject({ soft_pct: 75.5, hard_pct: 200 });
  });

  it.each(['soft_pct', 'hard_pct'])('rejects nonpositive or nonnumeric %s', (field) => {
    const example = KingdomSchema.parse(examples[0]);
    for (const value of [0, -1, '85', null]) {
      const parsed = KingdomSchema.safeParse({
        ...example,
        breakers: { ...example.breakers, [field]: value },
      });
      expect(parsed.success).toBe(false);
    }
  });
});
