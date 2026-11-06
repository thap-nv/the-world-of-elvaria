import { describe, expect, it } from 'vitest';

import { TribeSchema } from './tribe.ts';

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

  it('runs Gemini CLI only with a paid API key (ADR 0018)', () => {
    expect(verdictOf({ id: 'gemini', adapter: 'gemini_cli', tool })).toBe('tool.auth');
    expect(verdictOf({ id: 'gemini', adapter: 'gemini_cli' })).toBe('ok');
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
  });
});
