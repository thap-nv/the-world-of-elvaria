import { describe, expect, it } from 'vitest';

import { ADAPTER_FILE_PATTERN, TribeSchema } from './tribe.ts';

const base = { enabled: true, max_concurrent: 1 };
const tool = { path: '/usr/local/bin/gemini', version: '0.67.0' };
const paid = { ...tool, auth: 'api_key' };

/** `ok`, or the paths of the issues. */
const verdictOf = (value: object) => {
  const result = TribeSchema.safeParse({ ...base, ...value });
  return result.success ? 'ok' : result.error.issues.map((issue) => issue.path.join('.')).join(',');
};

describe('TribeSchema', () => {
  it('keeps enabled and max_concurrent required, as the v1 contract does', () => {
    expect(TribeSchema.safeParse({ id: 'claude', adapter: 'claude_code' }).success).toBe(false);
  });

  it('fills login as the default auth of a tool', () => {
    expect(TribeSchema.parse({ ...base, id: 'claude', adapter: 'claude_code', tool }).tool?.auth).toBe(
      'login',
    );
  });

  it('names no adapter: the sign-ins an adapter runs with are its declared capability (P1-19)', () => {
    // Gemini CLI runs only with a paid key (ADR 0018); runner-gemini declares it, checkTribeAuth checks it.
    expect(verdictOf({ id: 'gemini', adapter: 'gemini_cli', tool })).toBe('ok');
    expect(verdictOf({ id: 'gemini', adapter: 'gemini_cli', tool: paid, budget: { usd_week: 5 } })).toBe(
      'ok',
    );
  });

  it('asks a paid key for a weekly spend ceiling', () => {
    expect(verdictOf({ id: 'claude', adapter: 'claude_code', tool: paid })).toBe('budget.usd_week');
    expect(verdictOf({ id: 'claude', adapter: 'claude_code', tool: paid, budget: {} })).toBe(
      'budget.usd_week',
    );
    expect(verdictOf({ id: 'claude', adapter: 'claude_code', tool, budget: {} })).toBe('ok');
  });

  it('accepts an adapter file from the kingdom and rejects one elsewhere', () => {
    expect(verdictOf({ id: 'local', adapter: 'adapters/my-cli.mjs' })).toBe('ok');
    expect(verdictOf({ id: 'local', adapter: '../outside.mjs' })).toBe('adapter');
    expect(ADAPTER_FILE_PATTERN.test('adapters/my-cli.mjs')).toBe(true);
    expect(ADAPTER_FILE_PATTERN.test('claude_code')).toBe(false);
    expect(ADAPTER_FILE_PATTERN.test('adapters/sub/x.mjs')).toBe(false);
  });
});
