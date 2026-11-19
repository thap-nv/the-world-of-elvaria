import { describe, expect, it } from 'vitest';

import { templeLetterKeyOf, templeLetterKindOf, templeMemoOf } from './letters.ts';
import { VerdictIdSchema } from '../core/ids.ts';
import type { CharacterId, MemoId, MemoKindId, QuestId } from '../core/ids.ts';
import type { MemoKind } from '../schema/memo/memo-kind.ts';
import type { TempleLetter } from '../schema/temple/operation.ts';

const kind = (id: string, route: MemoKind['route']): MemoKind => ({
  id: id as MemoKindId,
  name_vi: id,
  name_en: id,
  route,
  description: id,
});
const REGISTRY = {
  memos: [kind('objection', 'judge'), kind('proposal', 'chancellor'), kind('note', 'chancellor')],
};
const QUEST = 'q_20261118_aaaaaa' as QuestId;

const letter = (rung: TempleLetter['rung'], to: TempleLetter['to']): TempleLetter => ({
  rung,
  to,
  source_verdict: VerdictIdSchema.parse('q_20261118_aaaaaa-2'),
  body: 'Add a check that runs the tests of the touched package.',
  refs: ['packages/steward/src/inbox/apply.ts'],
});

const made = (written: TempleLetter) =>
  templeMemoOf(
    {
      id: 'm_20261118_4k2pqz' as MemoId,
      kind: 'proposal',
      letter: written,
      from: 'sage' as CharacterId,
      quest: QUEST,
      attempt: 2,
      at: '2026-11-19T10:00:00+07:00',
    },
    REGISTRY,
  );

describe('the letters of a temple report', () => {
  it("files them as the registry's first kind routed to the Chancellor", () => {
    expect(templeLetterKindOf(REGISTRY)).toBe('proposal');
    expect(templeLetterKindOf({ memos: [kind('objection', 'judge')] })).toBeUndefined();
  });

  it('names a memo by its quest, its kind and its text, as any memo', () => {
    expect(templeLetterKeyOf(QUEST, 'proposal', { body: ' Add  a CHECK. ' })).toBe(
      `${QUEST}\nproposal\nadd a check.`,
    );
  });

  it("sends a check to the Chancellor and a stronger model to the owner, from the Monk, on the verdict's run", () => {
    const check = made(letter('check', 'chancellor'));
    expect(check).toEqual({
      ok: true,
      value: {
        version: 1,
        id: 'm_20261118_4k2pqz',
        kind: 'proposal',
        from: 'sage',
        quest: QUEST,
        attempt: 2,
        to: { route: 'chancellor' },
        body: 'Add a check that runs the tests of the touched package.',
        refs: ['packages/steward/src/inbox/apply.ts'],
        state: 'open',
        filed_at: '2026-11-19T10:00:00+07:00',
      },
    });
    const model = made(letter('model', 'owner'));
    expect(model.ok && model.value.to).toEqual({ route: 'owner' });
  });

  it('refuses a kind the registry does not have', () => {
    const refused = templeMemoOf(
      {
        id: 'm_20261118_4k2pqz' as MemoId,
        kind: 'gone',
        letter: letter('model', 'owner'),
        from: 'sage' as CharacterId,
        quest: QUEST,
        attempt: 2,
        at: '2026-11-19T10:00:00+07:00',
      },
      REGISTRY,
    );
    expect(refused).toEqual({ ok: false, error: { code: 'unknown_kind', kind: 'gone' } });
  });
});
