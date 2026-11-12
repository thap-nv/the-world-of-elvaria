import { describe, expect, it } from 'vitest';

import { InboxCommandSchema } from '../schema/command/inbox-command.ts';
import { Q1, Q2, at, quest } from './__fixtures__/snapshot.ts';
import { editQuest, setRank } from './new-quest.ts';

// The owner's edits of a quest (`elvaria quest edit`, §9.2), apart from new-quest.spec.ts since P1-54.
describe('editQuest and setRank', () => {
  const base = quest(Q1);
  const edit = (changes: Record<string, unknown>, expected = base.updated_at) => {
    const command = InboxCommandSchema.parse({
      version: 1,
      id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0A',
      ts: at(40),
      kind: 'edit_quest',
      source: 'cli',
      payload: { quest: Q1, expected_updated_at: expected, changes },
    });
    if (command.kind !== 'edit_quest') throw new Error('fixture');
    return editQuest(base, command.payload, { at: at(40), quests: [Q1, Q2] });
  };

  it('changes the fields it names, the budget field by field, and dates the change', () => {
    expect(edit({ title: 'Sharper', budget: { max_attempts: 5 } })).toMatchObject({
      ok: true,
      value: { title: 'Sharper', budget: { max_minutes: 45, max_attempts: 5 }, updated_at: at(40) },
    });
    expect(edit({ depends_on: [Q2] })).toMatchObject({ ok: true, value: { depends_on: [Q2] } });
  });

  it('refuses an edit of a quest that moved since the owner read it, of itself, or of a quest unknown', () => {
    expect(edit({ title: 'Late' }, at(1))).toEqual({ ok: false, error: { code: 'stale' } });
    expect(edit({ depends_on: [Q1] })).toEqual({ ok: false, error: { code: 'self_dependency' } });
    expect(edit({ depends_on: ['q_20261106_zzzzzz'] })).toEqual({
      ok: false,
      error: { code: 'unknown_dependency' },
    });
  });

  // P1-54, (b) of the P1-50 report: a raise of a party's token ceiling came back stale while its sessions ran.
  it('takes an edit of the budget alone whatever the quest became since the owner read it', () => {
    expect(edit({ budget: { max_tokens: 720_000 } }, at(1))).toMatchObject({
      ok: true,
      value: { budget: { max_tokens: 720_000, max_minutes: 45 }, updated_at: at(40) },
    });
    // The budget with any other field is an edit like any other.
    expect(edit({ budget: { max_tokens: 720_000 }, title: 'Late' }, at(1))).toEqual({
      ok: false,
      error: { code: 'stale' },
    });
  });

  it('sets the rank, never on an archived quest', () => {
    expect(setRank(base, 'C', at(40))).toMatchObject({ ok: true, value: { rank: 'C' } });
    const archived = { ...base, status: 'archived' as const };
    expect(setRank(archived, 'C', at(40))).toEqual({ ok: false, error: { code: 'archived' } });
  });
});
