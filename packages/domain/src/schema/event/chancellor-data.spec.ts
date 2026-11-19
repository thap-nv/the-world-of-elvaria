// The chancellor.answered line (fix/run-221-followups): what a session of the Chancellor's office spent, and what it
// must carry for the mana estimate to count it.
import { describe, expect, it } from 'vitest';

import { EVENT_VERSION, EventSchema } from './event.ts';

const line = (data: Record<string, unknown>) => ({
  v: EVENT_VERSION,
  id: '01JCFBR221FWCHANCEMEM000E1',
  ts: '2026-11-19T06:05:00+07:00',
  type: 'chancellor.answered',
  actor: { kind: 'character', id: 'veyra' },
  data,
});

const issuesOf = (value: unknown): string =>
  (EventSchema.safeParse(value).error?.issues ?? []).map((issue) => issue.path.join('.')).join('\n');

const ANSWERED = { tribe: 'codex', model: 'gpt-5.1-codex', matter: 'triage', tokens: 61_204 };

describe('chancellor.answered data', () => {
  it("accepts each matter of the office: the owner's words, a triage, an amendment", () => {
    for (const matter of ['drafts', 'triage', 'amendment'])
      expect(issuesOf(line({ ...ANSWERED, matter }))).toBe('');
  });

  it('refuses a line without the tribe or the model, whose pool the tokens are counted against', () => {
    const { tribe: _tribe, ...noTribe } = ANSWERED;
    const { model: _model, ...noModel } = ANSWERED;
    expect(issuesOf(line(noTribe))).toBe('data.tribe');
    expect(issuesOf(line(noModel))).toBe('data.model');
  });

  it('refuses negative or fractional tokens, a matter the office has not, and a field it does not write', () => {
    expect(issuesOf(line({ ...ANSWERED, tokens: -1 }))).toBe('data.tokens');
    expect(issuesOf(line({ ...ANSWERED, tokens: 1.5 }))).toBe('data.tokens');
    expect(issuesOf(line({ ...ANSWERED, matter: 'council' }))).toBe('data.matter');
    expect(issuesOf(line({ ...ANSWERED, quest: 'q_20261119_7k3m2a' }))).toBe('data');
  });

  it('refuses a model slug with capitals, as the other lines do', () => {
    expect(issuesOf(line({ ...ANSWERED, model: 'GPT-5.1' }))).toBe('data.model');
  });
});
