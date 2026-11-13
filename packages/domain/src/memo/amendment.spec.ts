import { describe, expect, it } from 'vitest';

import { MemoSchema } from '../schema/memo/memo.ts';
import { NO_AUTHORING, amendmentDeciderOf, authorOf, authorRoute, awaitsAuthor } from './amendment.ts';
import { memoOf, routeMemo } from './memo.ts';
import type { AuthorLookup, Authoring } from './amendment.ts';
import type { CharacterId, MemoId, QuestId } from '../core/ids.ts';
import type { MemoKind } from '../schema/memo/memo-kind.ts';
import type { Quest } from '../schema/quest/quest.ts';

type Lineage = Pick<Quest, 'created_by' | 'parent_id' | 'assignee'>;

const PLAN = 'q_20261113_pa0000' as QuestId;
const CHILD = 'q_20261113_ch0000' as QuestId;
const GRANDCHILD = 'q_20261113_gc0000' as QuestId;
const MAGE = 'merlin' as CharacterId;

const lookup = (quests: Record<string, Lineage>, present = (_id: CharacterId) => true): AuthorLookup => ({
  quests: new Map(Object.entries(quests) as [QuestId, Lineage][]),
  present,
});

const plan: Lineage = { created_by: 'chancellor', parent_id: null, assignee: MAGE };
const child: Lineage = { created_by: 'council', parent_id: PLAN, assignee: 'thorn' as CharacterId };

describe('authorOf', () => {
  it("names the Chancellor for a quest it drafted, and the owner for the owner's and the machine's", () => {
    const none = lookup({});
    expect(authorOf({ created_by: 'chancellor', parent_id: null }, none)).toEqual({ kind: 'chancellor' });
    for (const created_by of ['user', 'patrol', 'battle', 'campaign'] as const)
      expect(authorOf({ created_by, parent_id: null }, none)).toEqual({ kind: 'owner' });
  });

  it("names the mage of the plan a sub-quest came from, up the council's quests", () => {
    const quests = { [PLAN]: plan, [CHILD]: child };
    expect(authorOf(child, lookup(quests))).toEqual({ kind: 'mage', character: MAGE });
    const grandchild: Lineage = { created_by: 'council', parent_id: CHILD, assignee: null };
    expect(authorOf(grandchild, lookup({ ...quests, [GRANDCHILD]: grandchild }))).toEqual({
      kind: 'mage',
      character: MAGE,
    });
    // The owner's own plan quest names its mage too.
    expect(authorOf(child, lookup({ [PLAN]: { ...plan, created_by: 'user' } }))).toEqual({
      kind: 'mage',
      character: MAGE,
    });
  });

  it('falls back to the owner when the plan, its mage or the chain is gone', () => {
    expect(authorOf(child, lookup({}))).toEqual({ kind: 'owner' });
    expect(authorOf({ ...child, parent_id: null }, lookup({}))).toEqual({ kind: 'owner' });
    expect(authorOf(child, lookup({ [PLAN]: { ...plan, assignee: null } }))).toEqual({ kind: 'owner' });
    expect(
      authorOf(
        child,
        lookup({ [PLAN]: plan }, () => false),
      ),
    ).toEqual({ kind: 'owner' });
    // Parents that loop never end the walk on a plan.
    const loop: Lineage = { created_by: 'council', parent_id: CHILD, assignee: MAGE };
    expect(authorOf(loop, lookup({ [CHILD]: loop }))).toEqual({ kind: 'owner' });
  });
});

const authoring = (patch: Partial<Authoring> = {}): Authoring => ({
  author: { kind: 'chancellor' },
  rank: 'D',
  from_rank: 'F',
  memos: [],
  ...patch,
});

describe('authorRoute', () => {
  it('sends an amendment to the Chancellor, or to the mage it names', () => {
    expect(authorRoute('amendment', authoring())).toEqual({ route: 'author' });
    expect(authorRoute('amendment', authoring({ author: { kind: 'mage', character: MAGE } }))).toEqual({
      route: 'author',
      author: MAGE,
    });
  });

  it("sends it to the owner: a second one of the quest, the owner's quest, a rank below the kingdom's", () => {
    const second = authoring({ memos: [{ kind: 'proposal' }, { kind: 'amendment' }] });
    expect(authorRoute('amendment', second)).toEqual({ route: 'owner', refusal: 'second_amendment' });
    expect(authorRoute('amendment', authoring({ memos: [{ kind: 'proposal' }] }))).toEqual({
      route: 'author',
    });
    expect(authorRoute('amendment', authoring({ author: { kind: 'owner' } }))).toEqual({
      route: 'owner',
      refusal: 'no_author',
    });
    expect(authorRoute('amendment', authoring({ rank: 'E', from_rank: 'D' }))).toEqual({
      route: 'owner',
      refusal: 'below_rank',
    });
    expect(authorRoute('amendment', authoring({ rank: 'D', from_rank: 'D' }))).toEqual({ route: 'author' });
    expect(authorRoute('amendment', NO_AUTHORING)).toEqual({ route: 'owner', refusal: 'no_author' });
  });
});

describe('amendmentDeciderOf', () => {
  it('makes the quest wait for its author, or for the owner when no author may decide; no other memo', () => {
    expect(amendmentDeciderOf({ route: 'author' })).toBe('author');
    expect(amendmentDeciderOf({ route: 'owner', refusal: 'second_amendment' })).toBe('owner');
    expect(amendmentDeciderOf({ route: 'owner', refusal: 'final_verdict' })).toBeUndefined();
    expect(amendmentDeciderOf({ route: 'owner' })).toBeUndefined();
    expect(amendmentDeciderOf({ route: 'chancellor' })).toBeUndefined();
  });
});

describe('awaitsAuthor', () => {
  const asked = { question: 'Bước 2 sai.', asked_at: '2026-11-13T10:00:00+07:00' };
  const amendment = { memo: 'm_20261113_4k2pqz' as MemoId, by: 'author' } as const;

  it('is due while the quest is blocked on an amendment its author has not decided', () => {
    expect(awaitsAuthor({ status: 'blocked', blocked: { ...asked, amendment } })).toBe(true);
    expect(awaitsAuthor({ status: 'blocked', blocked: asked })).toBe(false);
    expect(
      awaitsAuthor({ status: 'blocked', blocked: { ...asked, amendment: { ...amendment, by: 'owner' } } }),
    ).toBe(false);
    const decided = { ...asked, amendment: { ...amendment, decision: 'rejected' } } as const;
    expect(awaitsAuthor({ status: 'blocked', blocked: decided })).toBe(false);
    expect(awaitsAuthor({ status: 'blocked', blocked: { ...asked, amendment, answer: 'Đúng.' } })).toBe(
      false,
    );
    expect(awaitsAuthor({ status: 'working', blocked: { ...asked, amendment } })).toBe(false);
  });
});

const REGISTRY = {
  memos: [
    {
      id: 'amendment',
      name_vi: 'Phản biện đề',
      name_en: 'Amendment',
      route: 'author',
      description: 'Wrong.',
    },
  ] as MemoKind[],
};

describe('an amendment through routeMemo and memoOf', () => {
  it('routes by who wrote the quest, and to the owner when nothing is known of it', () => {
    expect(routeMemo('amendment', REGISTRY, { authoring: authoring() })).toEqual({
      ok: true,
      value: { route: 'author' },
    });
    expect(routeMemo('amendment', REGISTRY)).toEqual({
      ok: true,
      value: { route: 'owner', refusal: 'no_author' },
    });
  });

  it('files a memo to its mage that the contract accepts', () => {
    const made = memoOf(
      {
        id: 'm_20261113_4k2pqz' as MemoId,
        draft: { kind: 'amendment', body: 'Step 2 names a file that is gone.', refs: [] },
        source: { quest: CHILD, attempt: 1, from: 'thorn' as CharacterId },
        at: '2026-11-13T10:00:00+07:00',
        authoring: authoring({ author: { kind: 'mage', character: MAGE } }),
      },
      REGISTRY,
    );
    expect(made.ok && made.value.to).toEqual({ route: 'author', author: MAGE });
  });

  it('refuses an author on a memo that goes elsewhere', () => {
    const memo = {
      version: 1,
      id: 'm_20261113_4k2pqz',
      kind: 'proposal',
      from: 'thorn',
      quest: CHILD,
      attempt: 1,
      to: { route: 'chancellor', author: MAGE },
      body: 'Elsewhere.',
      refs: [],
      state: 'open',
      filed_at: '2026-11-13T10:00:00+07:00',
    };
    expect(MemoSchema.safeParse(memo).error?.issues.map(({ message }) => message)).toEqual([
      'only a memo to its author names one',
    ]);
  });
});
