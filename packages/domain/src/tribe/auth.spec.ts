import { describe, expect, it } from 'vitest';

import { TribeSchema } from '../schema/tribe.ts';
import { checkTribeAuth, defaultAuthOf } from './auth.ts';

const tribe = (tool?: Record<string, unknown>) =>
  TribeSchema.parse({
    id: 'gemini',
    adapter: 'gemini_cli',
    enabled: true,
    max_concurrent: 1,
    ...(tool === undefined ? {} : { tool: { path: '/usr/bin/gemini', version: '0.67.0', ...tool } }),
    budget: { usd_week: 5 },
  });

describe('defaultAuthOf', () => {
  it("pins the owner's login whenever the adapter runs with it", () => {
    expect(defaultAuthOf({ auth: ['login'] })).toBe('login');
    expect(defaultAuthOf({ auth: ['api_key', 'login'] })).toBe('login');
  });

  it('pins the paid key of an adapter that runs only with one (Gemini CLI, ADR 0018)', () => {
    expect(defaultAuthOf({ auth: ['api_key'] })).toBe('api_key');
  });

  it('falls back to login for an adapter that declares nothing', () => {
    expect(defaultAuthOf({ auth: [] })).toBe('login');
  });
});

describe('checkTribeAuth', () => {
  it('accepts a pinned sign-in the adapter declares, and a tribe not pinned yet', () => {
    expect(checkTribeAuth({ auth: ['api_key'] }, tribe({ auth: 'api_key' }))).toEqual({
      ok: true,
      value: undefined,
    });
    expect(checkTribeAuth({ auth: ['api_key'] }, tribe())).toEqual({ ok: true, value: undefined });
  });

  it('refuses a sign-in the adapter does not run with, naming the ones it does', () => {
    expect(checkTribeAuth({ auth: ['api_key'] }, tribe({ auth: 'login' }))).toEqual({
      ok: false,
      error: { code: 'auth_not_declared', auth: 'login', declared: ['api_key'] },
    });
  });
});
