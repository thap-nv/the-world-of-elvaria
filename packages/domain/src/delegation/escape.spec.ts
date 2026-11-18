// The owner's report of an escaped defect (PS-08g): only on a quest already in its base branch, merged by the Steward
// (with the seal or without it) or done and then archived; once per quest.
import { describe, expect, it } from 'vitest';

import { merged } from '../patrol/__fixtures__/patrol-log.ts';
import { DOCS, ELVARIA, Q1, Q2, escaped, moved } from './__fixtures__/breaker-log.ts';
import { escapeOf, landingOf } from './escape.ts';

const DAY = '2026-11-18T09:00:00+07:00';

describe('landingOf', () => {
  it('a quest the Steward merged landed by its delivery.merged: without the seal when the delegation spared it', () => {
    expect(landingOf([merged(DAY, Q1, false)], Q1)).toEqual({ territory: ELVARIA, delegated: true });
    expect(landingOf([merged(DAY, Q1, true, DOCS)], Q1)).toEqual({ territory: DOCS, delegated: false });
  });

  it('a quest done and then archived landed by hand, with the seal or not; its territory from the line', () => {
    const passed = [moved('quest.done', Q1, 'done', DOCS), moved('quest.archived', Q1, 'archived', DOCS)];
    expect(landingOf(passed, Q1)).toEqual({ territory: DOCS, delegated: false });
    const sealed = [moved('quest.sealed', Q1, 'done'), moved('quest.archived', Q1, 'archived')];
    expect(landingOf(sealed, Q1)).toEqual({ territory: ELVARIA, delegated: false });
  });

  it('not yet: done with its pull request open, archived without being done, another quest merged', () => {
    expect(landingOf([moved('quest.done', Q1, 'done')], Q1)).toBeUndefined();
    expect(landingOf([moved('quest.archived', Q1, 'archived')], Q1)).toBeUndefined();
    const other = [
      merged(DAY, Q2, false),
      moved('quest.done', Q2, 'done'),
      moved('quest.archived', Q2, 'archived'),
    ];
    expect(landingOf(other, Q1)).toBeUndefined();
    expect(landingOf([], Q1)).toBeUndefined();
  });
});

describe('escapeOf', () => {
  it("the report's line: the quest's landing, with the owner's note when it says something", () => {
    const events = [merged(DAY, Q1, false)];
    expect(escapeOf(events, Q1, 'the login page broke')).toEqual({
      ok: true,
      value: { quest: Q1, territory: ELVARIA, delegated: true, note: 'the login page broke' },
    });
    expect(escapeOf(events, Q1, '  ')).toEqual({
      ok: true,
      value: { quest: Q1, territory: ELVARIA, delegated: true },
    });
    expect(escapeOf(events, Q1)).toEqual({
      ok: true,
      value: { quest: Q1, territory: ELVARIA, delegated: true },
    });
  });

  it('refused for a quest not in its base branch yet, and for one already reported', () => {
    expect(escapeOf([moved('quest.done', Q1, 'done')], Q1)).toEqual({
      ok: false,
      error: { code: 'not_merged' },
    });
    const reported = [merged(DAY, Q1, true), escaped(Q1, false)];
    expect(escapeOf(reported, Q1)).toEqual({ ok: false, error: { code: 'already_reported' } });
    expect(escapeOf([...reported, merged(DAY, Q2, true)], Q2).ok).toBe(true);
  });
});
