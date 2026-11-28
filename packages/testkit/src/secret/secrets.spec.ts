// The samples are only useful while each line really carries its secret, and each pattern has one sample.
import { describe, expect, it } from 'vitest';

import { KNOWN_SECRET, SECRET_SAMPLES } from './secrets.ts';

describe('SECRET_SAMPLES', () => {
  it('puts each secret inside its line, one sample per kind', () => {
    SECRET_SAMPLES.forEach(({ secret, line }) => {
      expect(line).toContain(secret);
    });
    const kinds = SECRET_SAMPLES.map(({ kind }) => kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('keeps the treasury value among the samples, as the kind `known`', () => {
    expect(SECRET_SAMPLES.find(({ kind }) => kind === 'known')?.secret).toBe(KNOWN_SECRET);
  });
});
