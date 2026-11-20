// The temple.ran line (PS-12d): a run of the Temple, with what its session spent when one ran.
import { describe, expect, it } from 'vitest';

import { EVENT_VERSION, EventSchema } from './event.ts';

const line = (data: Record<string, unknown>) => ({
  v: EVENT_VERSION,
  id: '01JCFBR221FWTEMPXERAN000E1',
  ts: '2026-11-19T06:05:00+07:00',
  type: 'temple.ran',
  actor: { kind: 'steward' },
  data,
});

const issuesOf = (value: unknown): string =>
  (EventSchema.safeParse(value).error?.issues ?? []).map((issue) => issue.path.join('.')).join('\n');

const NO_SESSION = { trigger: 'quests', day: '2026-11-19', groups: 0, operations: 0, letters: 0 };
const SESSION = {
  ...NO_SESSION,
  groups: 2,
  tribe: 'gemini',
  model: 'gemini-3.8-flash-low',
  tokens: 9840,
  session: 's1',
};

describe('temple.ran data', () => {
  it('accepts an optional lowercase sha256 hash and rejects malformed hashes', () => {
    expect(issuesOf(line({ ...SESSION, evidence_hash: 'ab'.repeat(32) }))).toBe('');
    for (const evidence_hash of ['ab'.repeat(31), 'ab'.repeat(33), 'AB'.repeat(32), 'g'.repeat(64), 42])
      expect(issuesOf(line({ ...SESSION, evidence_hash }))).toBe('data.evidence_hash');
  });
  it('takes a run with no session, and a run whose session names its tribe, model and tokens', () => {
    expect(issuesOf(line(NO_SESSION))).toBe('');
    expect(issuesOf(line(SESSION))).toBe('');
    for (const trigger of ['quests', 'weekly', 'suspension', 'owner'])
      expect(issuesOf(line({ ...NO_SESSION, trigger }))).toBe('');
  });

  it('refuses a session with a tribe and no model, whose pool the tokens would go to', () => {
    const { model: _model, ...noModel } = SESSION;
    expect(issuesOf(line(noModel))).toBe('data.model');
  });

  it('refuses an unknown trigger, a day not yyyy-mm-dd and a negative count', () => {
    expect(issuesOf(line({ ...NO_SESSION, trigger: 'daily' }))).toBe('data.trigger');
    expect(issuesOf(line({ ...NO_SESSION, day: '20261119' }))).toBe('data.day');
    expect(issuesOf(line({ ...NO_SESSION, letters: -1 }))).toBe('data.letters');
  });
});
