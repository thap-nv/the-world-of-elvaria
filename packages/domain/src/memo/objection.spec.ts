import { describe, expect, it } from 'vitest';

import { MemoSchema } from '../schema/memo/memo.ts';
import { closeMemo, memoOf } from './memo.ts';
import { NO_CONTEST, contestRoute, objectionOf, objectionOutcomeOf } from './objection.ts';
import type { CharacterId, MemoId, QuestId, VerdictId } from '../core/ids.ts';
import type { MemoKind } from '../schema/memo/memo-kind.ts';
import type { Memo } from '../schema/memo/memo.ts';
import type { Contest } from './objection.ts';

const QUEST = 'q_20261112_7pzkfv' as QuestId;
const AT = '2026-11-12T10:41:07+07:00';
const FIRST = `${QUEST}-1` as VerdictId;
const SECOND = `${QUEST}-2` as VerdictId;
const REGISTRY = {
  memos: [
    { id: 'proposal', name_vi: 'Đề xuất', name_en: 'Proposal', route: 'chancellor', description: 'Outside.' },
    { id: 'objection', name_vi: 'Phản biện', name_en: 'Objection', route: 'judge', description: 'Contest.' },
  ] as MemoKind[],
};
const judged = { id: FIRST, verifier_id: 'sable', by_human: false };
const filed = (id: string, to: Memo['to'], state: Memo['state'] = 'open') => ({
  id: id as MemoId,
  state,
  to,
});

describe('contestRoute', () => {
  it("takes an objection to a second judge when it contests a judge's fail that nothing contests yet", () => {
    expect(contestRoute({ verdict: judged, memos: [] })).toEqual({ route: 'judge', verdict: FIRST });
    const proposal = filed('m_20261112_aaaaaa', { route: 'chancellor' });
    const elsewhere = filed('m_20261112_bbbbbb', { route: 'judge', verdict: SECOND });
    expect(contestRoute({ verdict: judged, memos: [proposal, elsewhere] }).route).toBe('judge');
  });

  it('sends it to the owner with the reason otherwise: one per verdict, the second verdict final', () => {
    expect(contestRoute(NO_CONTEST)).toEqual({ route: 'owner', refusal: 'no_verdict' });
    const owners = { ...judged, verifier_id: 'user', by_human: true };
    expect(contestRoute({ verdict: owners, memos: [] })).toEqual({
      route: 'owner',
      verdict: FIRST,
      refusal: 'owner_verdict',
    });
    const answered = {
      ...judged,
      objection: { memo: 'm_20261112_aaaaaa' as MemoId, verdict: FIRST, judge: 'orin' },
    };
    expect(contestRoute({ verdict: answered, memos: [] })).toMatchObject({ refusal: 'final_verdict' });
    // Closed by the owner or not, the verdict has had its objection.
    for (const state of ['open', 'closed'] as const) {
      const first = filed('m_20261112_aaaaaa', { route: 'judge', verdict: FIRST }, state);
      expect(contestRoute({ verdict: judged, memos: [first] })).toEqual({
        route: 'owner',
        verdict: FIRST,
        refusal: 'second_objection',
      });
    }
  });
});

describe('objectionOf', () => {
  it("names the open objection to the run's verdict, with that verdict's judge", () => {
    const memos = [
      filed('m_20261112_aaaaaa', { route: 'owner', verdict: FIRST, refusal: 'second_objection' }),
      filed('m_20261112_bbbbbb', { route: 'judge', verdict: FIRST }),
    ];
    expect(objectionOf({ verdict: judged, memos })).toEqual({
      memo: 'm_20261112_bbbbbb',
      verdict: FIRST,
      judge: 'sable',
    });
  });

  it('names none without a verdict, or when the objection was decided', () => {
    const open = filed('m_20261112_bbbbbb', { route: 'judge', verdict: FIRST });
    expect(objectionOf({ verdict: undefined, memos: [open] })).toBeUndefined();
    expect(objectionOf({ verdict: judged, memos: [{ ...open, state: 'closed' }] })).toBeUndefined();
  });
});

describe('objectionOutcomeOf', () => {
  it("sustains on the second judge's pass, overrules on its fail, and waits through a partial", () => {
    expect(objectionOutcomeOf({ id: SECOND, result: 'pass' })).toEqual({
      decision: 'sustained',
      verdict: SECOND,
    });
    expect(objectionOutcomeOf({ id: SECOND, result: 'fail' })).toEqual({
      decision: 'overruled',
      verdict: SECOND,
    });
    expect(objectionOutcomeOf({ id: SECOND, result: 'partial' })).toBeUndefined();
  });
});

describe('an objection memo', () => {
  const draft = { kind: 'objection', body: 'Note 2 is wrong: the spec covers it.', refs: ['src/a.spec.ts'] };
  const source = { quest: QUEST, attempt: 2, from: 'thorn' as CharacterId };
  const made = (contest?: Contest) =>
    memoOf(
      { id: 'm_20261112_4k2pqz' as MemoId, draft, source, at: AT, ...(contest ? { contest } : {}) },
      REGISTRY,
    );

  it('is filed to the judge or to the owner by its contest, and closed by the second verdict', () => {
    const toJudge = made({ verdict: judged, memos: [] });
    if (!toJudge.ok) throw new Error('not filed');
    expect(toJudge.value.to).toEqual({ route: 'judge', verdict: FIRST });
    const closed = closeMemo(toJudge.value, { decision: 'sustained', verdict: SECOND }, AT);
    expect(closed.ok && closed.value.outcome).toEqual({ decision: 'sustained', at: AT, verdict: SECOND });
    expect(made()).toMatchObject({ ok: true, value: { to: { route: 'owner', refusal: 'no_verdict' } } });
  });

  it('keeps the route and outcome rules of the schema', () => {
    const base = { ...(made({ verdict: judged, memos: [] }) as { value: Memo }).value };
    const issues = (memo: unknown) =>
      MemoSchema.safeParse(memo).error?.issues.map(({ path }) => path.join('.')) ?? [];
    expect(issues({ ...base, to: { route: 'judge' } })).toEqual(['to.verdict']);
    expect(issues({ ...base, to: { route: 'judge', verdict: FIRST, refusal: 'no_verdict' } })).toEqual([
      'to.refusal',
    ]);
    const outcome = { decision: 'overruled', at: AT };
    expect(issues({ ...base, state: 'closed', outcome })).toEqual(['outcome.verdict']);
    expect(
      issues({ ...base, state: 'closed', outcome: { ...outcome, decision: 'shelved', verdict: SECOND } }),
    ).toEqual(['outcome.verdict']);
  });
});
