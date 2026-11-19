// The tribe.checked line (run (221) (b)): what a tribe check against the real CLI spent, and what it must carry.
import { describe, expect, it } from 'vitest';

import { EVENT_VERSION, EventSchema } from './event.ts';

const line = (data: Record<string, unknown>) => ({
  v: EVENT_VERSION,
  id: '01JCF8X4Z6Q3W9N2M5R7T8V0YB',
  ts: '2026-11-18T18:48:00+07:00',
  type: 'tribe.checked',
  actor: { kind: 'user' },
  data,
});

const issuesOf = (value: unknown): string =>
  (EventSchema.safeParse(value).error?.issues ?? []).map((issue) => issue.path.join('.')).join('\n');

const CHECKED = {
  tribe: 'gemini',
  model: 'gemini-3.8-flash-high',
  outcome: 'failed',
  tokens: 9482,
  checks: [
    { check: 'capabilities', outcome: 'passed', tokens: 0 },
    { check: 'forbidden_command', outcome: 'failed', tokens: 9482 },
    { check: 'image', outcome: 'skipped', tokens: 0 },
  ],
};

describe('tribe.checked data', () => {
  it('accepts a check that failed on the server, with the tokens its sessions spent', () => {
    expect(issuesOf(line(CHECKED))).toBe('');
  });

  it('refuses a line without the model, whose pool the tokens are counted against', () => {
    const { model: _model, ...rest } = CHECKED;
    expect(issuesOf(line(rest))).toBe('data.model');
  });

  it('refuses negative or fractional tokens, and an outcome the suite has not', () => {
    expect(issuesOf(line({ ...CHECKED, tokens: -1 }))).toBe('data.tokens');
    expect(issuesOf(line({ ...CHECKED, tokens: 1.5 }))).toBe('data.tokens');
    expect(issuesOf(line({ ...CHECKED, outcome: 'skipped' }))).toBe('data.outcome');
    const odd = { ...CHECKED, checks: [{ check: 'submit', outcome: 'refused', tokens: 0 }] };
    expect(issuesOf(line(odd))).toBe('data.checks.0.outcome');
  });

  it('refuses a model slug with capitals, as the other lines do', () => {
    expect(issuesOf(line({ ...CHECKED, model: 'Gemini-3.8' }))).toBe('data.model');
  });
});
