import { describe, expect, it } from 'vitest';

import { MEMO_ID_PATTERN } from '../core/ids.ts';
import { MemoSchema } from '../schema/memo/memo.ts';
import {
  closeMemo,
  escalateMemo,
  memoIdOf,
  memoKeyOf,
  memoOf,
  normalizedMemoText,
  routeMemo,
} from './memo.ts';
import type { CharacterId, MemoId, QuestId } from '../core/ids.ts';
import type { MemoKind } from '../schema/memo/memo-kind.ts';
import type { Memo } from '../schema/memo/memo.ts';

const QUEST = 'q_20261112_7pzkfv' as QuestId;
const AT = '2026-11-12T10:41:07+07:00';
const REGISTRY = {
  memos: [
    { id: 'proposal', name_vi: 'Đề xuất', name_en: 'Proposal', route: 'chancellor', description: 'Outside.' },
  ] as MemoKind[],
};
const DRAFT = {
  kind: 'proposal',
  body: 'Dates in `quest list` are UTC.',
  refs: ['apps/cli/src/quest/list.ts'],
};
const SOURCE = { quest: QUEST, attempt: 2, from: 'thorn' as CharacterId };
const ID = 'm_20261112_4k2pqz' as MemoId;

describe('routeMemo', () => {
  it("sends a memo where its kind's entry says", () => {
    expect(routeMemo('proposal', REGISTRY)).toEqual({ ok: true, value: { route: 'chancellor' } });
  });

  it('refuses a kind the registry does not have', () => {
    expect(routeMemo('advisory', REGISTRY)).toEqual({
      ok: false,
      error: { code: 'unknown_kind', kind: 'advisory' },
    });
  });
});

describe('the id of a memo', () => {
  it('reads the text in one form, its spaces collapsed, in lower case', () => {
    // "ệ" as one code point and as e + two combining marks.
    expect(normalizedMemoText('  Sửa  Lệ\nphí  ')).toBe(normalizedMemoText('sửa lệ phí'));
    expect(normalizedMemoText('  A\t b \r\n c ')).toBe('a b c');
  });

  it('keys on the quest, the kind and the text, not on the refs', () => {
    expect(memoKeyOf(QUEST, DRAFT)).toBe(`${QUEST}\nproposal\ndates in \`quest list\` are utc.`);
    expect(memoKeyOf(QUEST, { kind: 'proposal', body: 'Dates  in `quest list` are UTC.' })).toBe(
      memoKeyOf(QUEST, DRAFT),
    );
    expect(memoKeyOf('q_20261112_aaaaaa' as QuestId, DRAFT)).not.toBe(memoKeyOf(QUEST, DRAFT));
  });

  it("carries the quest's day and the digest's first digits", () => {
    const id = memoIdOf(QUEST, new Uint8Array(32));
    expect(id).toBe('m_20261112_000000');
    expect(id).toMatch(MEMO_ID_PATTERN);
    expect(memoIdOf(QUEST, new Uint8Array(32).fill(255))).toBe('m_20261112_zzzzzz');
  });
});

describe('memoOf', () => {
  it('files an open memo, routed, from the letter of the run', () => {
    const made = memoOf({ id: ID, draft: DRAFT, source: SOURCE, at: AT }, REGISTRY);
    expect(made).toEqual({
      ok: true,
      value: {
        version: 1,
        id: ID,
        kind: 'proposal',
        from: 'thorn',
        quest: QUEST,
        attempt: 2,
        to: { route: 'chancellor' },
        body: DRAFT.body,
        refs: DRAFT.refs,
        state: 'open',
        filed_at: AT,
      },
    });
  });

  it('refuses a memo of an unknown kind', () => {
    const made = memoOf({ id: ID, draft: { ...DRAFT, kind: 'gossip' }, source: SOURCE, at: AT }, REGISTRY);
    expect(made).toEqual({ ok: false, error: { code: 'unknown_kind', kind: 'gossip' } });
  });

  it('refuses a memo the contract refuses, saying where', () => {
    const made = memoOf(
      { id: ID, draft: { ...DRAFT, body: 'x'.repeat(2001) }, source: SOURCE, at: AT },
      REGISTRY,
    );
    if (made.ok || made.error.code !== 'invalid') throw new Error('expected the contract to refuse it');
    expect(made.error.message).toContain('body:');
  });
});

describe('closeMemo', () => {
  const memo = MemoSchema.parse({
    version: 1,
    id: ID,
    kind: 'proposal',
    from: 'thorn',
    quest: QUEST,
    attempt: 1,
    to: { route: 'chancellor' },
    body: 'x',
    refs: [],
    state: 'open',
    filed_at: AT,
  });
  const LATER = '2026-11-12T15:00:00+07:00';

  it('closes an open memo with the decision, its quest and note when given', () => {
    const handled = closeMemo(memo, { decision: 'handled', quest: QUEST, note: 'merged' }, LATER);
    expect(handled.ok && handled.value).toEqual({
      ...memo,
      state: 'closed',
      outcome: { decision: 'handled', at: LATER, quest: QUEST, note: 'merged' },
    });
    const shelved = closeMemo(memo, { decision: 'shelved' }, LATER);
    expect(shelved.ok && shelved.value.outcome).toEqual({ decision: 'shelved', at: LATER });
    expect(shelved.ok && MemoSchema.safeParse(shelved.value).success).toBe(true);
  });

  it('decides a memo once', () => {
    const closed: Memo = { ...memo, state: 'closed', outcome: { decision: 'rejected', at: LATER } };
    expect(closeMemo(closed, { decision: 'shelved' }, LATER)).toEqual({
      ok: false,
      error: { code: 'closed' },
    });
  });

  it('keeps the triage’s advice on an open memo, once (PS-03b)', () => {
    const advice = {
      action: 'merge',
      quest: QUEST,
      addendum: 'Also this.',
      holds: ['above_rank'],
      note: 'C',
    } as const;
    const sent = escalateMemo(memo, advice, LATER);
    expect(sent.ok && sent.value.escalation).toEqual({ at: LATER, ...advice });
    expect(sent.ok && MemoSchema.safeParse(sent.value).success).toBe(true);
    const owner = escalateMemo(memo, { action: 'owner', holds: ['chancellor_asks'], note: 'Yours.' }, LATER);
    expect(owner.ok && owner.value.escalation).toEqual({
      at: LATER,
      action: 'owner',
      holds: ['chancellor_asks'],
      note: 'Yours.',
    });
    expect(sent.ok && escalateMemo(sent.value, advice, LATER)).toEqual({
      ok: false,
      error: { code: 'escalated' },
    });
    const closed: Memo = { ...memo, state: 'closed', outcome: { decision: 'rejected', at: LATER } };
    expect(escalateMemo(closed, advice, LATER)).toEqual({ ok: false, error: { code: 'closed' } });
  });
});
