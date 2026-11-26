// kingdom.herald (P2-01, W12): optional, every key defaulted, so a kingdom file written before it stays valid.
import { describe, expect, it } from 'vitest';

import { HeraldSchema } from './kingdom-herald.ts';

describe('HeraldSchema', () => {
  it('listens on 7411 and lets in no origin but loopback for a kingdom without the key', () => {
    expect(HeraldSchema.parse(undefined)).toEqual({ port: 7411, origins: [] });
  });

  it("keeps the owner's port and tunnel origins", () => {
    const herald = { port: 8080, origins: ['https://elvaria.example.ts.net', 'http://phone.lan:7411'] };
    expect(HeraldSchema.parse(herald)).toEqual(herald);
  });

  it('refuses an address to bind, a port out of range, and an origin with a path, upper case or twice', () => {
    expect(HeraldSchema.safeParse({ host: '0.0.0.0' }).success).toBe(false);
    expect(HeraldSchema.safeParse({ port: 0 }).success).toBe(false);
    expect(HeraldSchema.safeParse({ port: 65_536 }).success).toBe(false);
    expect(HeraldSchema.safeParse({ origins: ['https://elvaria.example.ts.net/'] }).success).toBe(false);
    expect(HeraldSchema.safeParse({ origins: ['https://Elvaria.example.ts.net'] }).success).toBe(false);
    expect(HeraldSchema.safeParse({ origins: ['ftp://elvaria.example.ts.net'] }).success).toBe(false);
    expect(HeraldSchema.safeParse({ origins: ['https://a.net', 'https://a.net'] }).success).toBe(false);
  });
});
