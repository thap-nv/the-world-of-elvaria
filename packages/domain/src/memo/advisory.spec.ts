import { describe, expect, it } from 'vitest';

import { quest } from '../dispatch/__fixtures__/snapshot.ts';
import { MEMO_REFS_MAX } from '../schema/memo/constants.ts';
import { MemoSchema } from '../schema/memo/memo.ts';
import {
  advisoriesFor,
  advisoryBodyOf,
  advisoryKeyOf,
  advisoryKindOf,
  advisoryOf,
  advisoryRefsFor,
  deliveredTo,
  deliveryEndOf,
  recipientsOf,
} from './advisory.ts';
import type { QuestId } from '../core/ids.ts';
import type { MemoKind } from '../schema/memo/memo-kind.ts';
import type { Memo } from '../schema/memo/memo.ts';
import type { Quest } from '../schema/quest/quest.ts';

const [L, A, B, C] = ['q_20261117_aaaaaa', 'q_20261117_bbbbbb', 'q_20261117_cccccc', 'q_20261117_dddddd'];
const AT = '2026-11-17T10:00:00+07:00';

/** A quest that has run once and holds its plot, `returned` unless told. */
const ran = (id: string, scope: readonly string[] | undefined, over: Partial<Quest> = {}): Quest => ({
  ...quest(id, scope === undefined ? {} : { scope }),
  status: 'returned',
  attempts: 1,
  plot: { type: 'worktree', path: `/plots/${id}`, branch: `quest/${id}` },
  ...over,
});

const LANDED = ran(L, ['packages/domain/src/memo/**'], { status: 'done' });
const MEMO_FILE = 'packages/domain/src/memo/memo.ts';

describe('recipientsOf', () => {
  it('names the quests at work whose scope meets the files, by id', () => {
    const quests = [LANDED, ran(B, ['packages/domain/src/memo/**']), ran(A, ['packages/domain/**'])];
    expect(recipientsOf(LANDED, [MEMO_FILE], quests)).toEqual([A, B]);
  });

  it('passes over a scope the files miss, and gives every file to a quest without a scope', () => {
    const quests = [LANDED, ran(A, ['apps/cli/**']), ran(B, undefined)];
    expect(recipientsOf(LANDED, [MEMO_FILE], quests)).toEqual([B]);
  });

  it('passes over quests that never ran, hold no plot, are finished, script-tier or elsewhere', () => {
    const scope = ['packages/**'];
    const quests = [
      LANDED,
      { ...ran(A, scope), attempts: 0, status: 'open' as const },
      { ...ran(B, scope), plot: { type: 'none' as const } },
      ran(C, scope, { status: 'done' }),
      ran('q_20261117_eeeeee', scope, { status: 'archived' }),
      ran('q_20261117_ffffff', scope, { status: 'draft' }),
      ran('q_20261117_gggggg', scope, { tier: 'script' }),
      ran('q_20261117_hhhhhh', scope, { territory: 'elvaria' as Quest['territory'] }),
    ];
    expect(recipientsOf(LANDED, [MEMO_FILE], quests)).toEqual([]);
  });

  it('counts a quest at work in every state after a run, a retried one by its log', () => {
    const states = [
      'open',
      'claimed',
      'working',
      'review',
      'awaiting_seal',
      'blocked',
      'paused_mana',
      'infirmary',
    ];
    const quests = states.map((status, index) =>
      ran(`q_20261117_${String(index)}aaaaa`, ['packages/**'], { status: status as Quest['status'] }),
    );
    // A retry from the infirmary sets attempts back to 0 and keeps the log: the quest has run.
    const entry = { n: 1, role: 'assignee', character: 'thorn' };
    const logged = {
      ...ran(A, ['packages/**'], { status: 'open' }),
      attempts: 0,
      attempt_log: [entry],
    } as unknown as Quest;
    expect(recipientsOf(LANDED, [MEMO_FILE], [LANDED, ...quests, logged])).toHaveLength(states.length + 1);
  });

  it("passes over the quest's party and the quests built on its branch or under it", () => {
    const merge = {
      ...ran(L, ['packages/**'], { status: 'done' }),
      party_id: C as QuestId,
      party_role: 'merge' as const,
    };
    const part = { ...ran(A, ['packages/**']), party_id: C as QuestId, party_role: 'part' as const };
    const after = ran(B, ['packages/**'], { depends_on: [L as QuestId] });
    const under = ran(C, ['packages/**']);
    const landed = { ...merge, party_id: undefined, party_role: undefined, depends_on: [C as QuestId] };
    expect(recipientsOf(merge, [MEMO_FILE], [merge, part, after])).toEqual([]);
    expect(recipientsOf(landed, [MEMO_FILE], [landed, under])).toEqual([]);
  });

  it('names nobody for no file', () => {
    expect(recipientsOf(LANDED, [], [LANDED, ran(A, undefined)])).toEqual([]);
  });
});

describe('advisoryOf', () => {
  it('names the files that meet a recipient, sorted, and leaves the shared ones out', () => {
    const quests = [LANDED, ran(A, ['packages/domain/**']), ran(B, ['apps/cli/**'])];
    const changed = ['pnpm-lock.yaml', 'packages/domain/src/b.ts', 'packages/domain/src/a.ts', 'docs/x.md'];
    expect(advisoryOf(LANDED, changed, quests, ['pnpm-lock.yaml'])).toEqual({
      quests: [A],
      refs: ['packages/domain/src/a.ts', 'packages/domain/src/b.ts'],
      more: 0,
    });
  });

  it('writes none when only shared files meet a scope, or nobody is at work', () => {
    const quests = [LANDED, ran(A, ['docs/**'])];
    expect(
      advisoryOf(LANDED, ['docs/schemas/memo.schema.json'], quests, ['docs/schemas/memo.schema.json']),
    ).toBe(undefined);
    expect(advisoryOf(LANDED, [MEMO_FILE], [LANDED], [])).toBe(undefined);
  });

  it('keeps MEMO_REFS_MAX files and counts the rest', () => {
    const changed = Array.from(
      { length: MEMO_REFS_MAX + 3 },
      (_, n) => `src/f${String(n).padStart(2, '0')}.ts`,
    );
    const advisory = advisoryOf(LANDED, changed, [LANDED, ran(A, undefined)], []);
    expect(advisory?.refs).toHaveLength(MEMO_REFS_MAX);
    expect(advisory?.more).toBe(3);
  });

  it("writes one for a party's merge quest, none for its parts and contract", () => {
    const other = ran(B, undefined);
    const merge = { ...LANDED, party_id: C as QuestId, party_role: 'merge' as const };
    const part = { ...LANDED, party_id: C as QuestId, party_role: 'part' as const };
    expect(advisoryOf(merge, [MEMO_FILE], [merge, other], [])?.quests).toEqual([B]);
    expect(advisoryOf(part, [MEMO_FILE], [part, other], [])).toBe(undefined);
  });

  it("writes none for a quest the merge queue's merge quest took into the base branch, one once it was dropped (PS-09b)", () => {
    const other = ran(B, undefined);
    const merge = (delivered: boolean): Quest => ({
      ...ran(C, undefined, { status: delivered ? 'done' : 'archived' }),
      party_id: L as QuestId,
      party_role: 'merge',
      parent_id: L as QuestId,
      created_by: 'patrol',
      deliverable: { type: 'branch', ...(delivered ? { delivered_at: AT } : {}) },
    });
    expect(advisoryOf(LANDED, [MEMO_FILE], [LANDED, other, merge(true)], [])).toBe(undefined);
    expect(advisoryOf(LANDED, [MEMO_FILE], [LANDED, other, merge(false)], [])?.quests).toEqual([B]);
    // A party's own merge quest names its contract as parent: the contract writes none anyway, by its party.
    const own = { ...merge(true), created_by: 'council' as const };
    expect(advisoryOf(LANDED, [MEMO_FILE], [LANDED, other, own], [])?.quests).toEqual([B]);
  });
});

const KIND = { id: 'advisory', name_vi: 'Báo tin', name_en: 'Advisory', route: 'quests', description: 'x' };

describe('the advisory as a memo', () => {
  it('takes the kind routed to quests, none in an older registry', () => {
    const proposal = { ...KIND, id: 'proposal', route: 'chancellor' };
    expect(advisoryKindOf({ memos: [proposal, KIND] as MemoKind[] })).toBe('advisory');
    expect(advisoryKindOf({ memos: [proposal] as MemoKind[] })).toBe(undefined);
  });

  it('keys it by the quest alone', () => {
    expect(advisoryKeyOf(L as QuestId, 'advisory')).toBe(`${L}\nadvisory\nreached its base branch`);
  });

  it('says which quest, its title, the commit, how to read a file, and the files it does not name', () => {
    const body = advisoryBodyOf({ id: L as QuestId, title: 'Memo routes' }, 'abc1234', 0);
    expect(body).toContain(`Quest ${L} ("Memo routes") reached the base branch at abc1234`);
    expect(body).toContain('`git show abc1234:<path>`');
    expect(body).not.toContain('more');
    expect(advisoryBodyOf({ id: L as QuestId, title: 'T' }, 'abc1234', 4)).toContain('and 4 more');
  });
});

const memo = (id: string, over: Partial<Memo> = {}): Memo =>
  MemoSchema.parse({
    version: 1,
    id,
    kind: 'advisory',
    quest: L,
    attempt: 1,
    to: { route: 'quests', quests: [A, B] },
    body: 'Quest reached the base branch.',
    refs: ['packages/domain/src/a.ts', 'apps/cli/src/b.ts'],
    state: 'open',
    filed_at: AT,
    ...over,
  });

describe('delivering an advisory', () => {
  const older = memo('m_20261117_aaaaaa', { filed_at: '2026-11-17T09:00:00+07:00' });
  const newer = memo('m_20261117_bbbbbb');
  const read = memo('m_20261117_cccccc', { deliveries: [{ quest: A as QuestId, attempt: 2, at: AT }] });
  const closed = memo('m_20261117_dddddd', { state: 'closed', outcome: { decision: 'lapsed', at: AT } });
  const proposal = memo('m_20261117_eeeeee', {
    kind: 'proposal' as Memo['kind'],
    to: { route: 'chancellor' },
  });

  it('gives a quest the open advisories to it it has not read, newest first', () => {
    const memos = [older, newer, read, closed, proposal];
    expect(advisoriesFor(memos, A as QuestId).map(({ id }) => id)).toEqual([newer.id, older.id]);
    expect(advisoriesFor(memos, C as QuestId)).toEqual([]);
    const same = memo('m_20261117_ffffff');
    expect(advisoriesFor([same, newer], A as QuestId).map(({ id }) => id)).toEqual([same.id, newer.id]);
  });

  it("names the files the reader's scope may hold, all of them when none does or it has no scope", () => {
    expect(advisoryRefsFor(newer, ran(A, ['apps/**']))).toEqual(['apps/cli/src/b.ts']);
    expect(advisoryRefsFor(newer, ran(A, ['docs/**']))).toEqual(newer.refs);
    expect(advisoryRefsFor(newer, ran(A, undefined))).toEqual(newer.refs);
  });

  it('records a reading once', () => {
    const delivery = { quest: A as QuestId, attempt: 2, at: AT };
    const once = deliveredTo(newer, delivery);
    expect(once.deliveries).toEqual([delivery]);
    expect(deliveredTo(once, { ...delivery, attempt: 3 })).toBe(once);
  });

  it('ends delivered once every quest read it or left, lapsed once all left unread', () => {
    const statuses = new Map<string, Quest['status']>([
      [A, 'working'],
      [B, 'returned'],
    ]);
    const questOf = (id: QuestId) => {
      const status = statuses.get(id);
      return status === undefined ? undefined : { status };
    };
    expect(deliveryEndOf(read, questOf)).toBe(undefined);
    statuses.set(B, 'archived');
    expect(deliveryEndOf(read, questOf)).toBe('delivered');
    expect(deliveryEndOf(newer, questOf)).toBe(undefined);
    statuses.set(A, 'done');
    expect(deliveryEndOf(newer, questOf)).toBe('lapsed');
    statuses.delete(A);
    expect(deliveryEndOf(newer, questOf)).toBe('lapsed');
  });

  it('ends nothing but an open memo to quests', () => {
    const none = () => undefined;
    expect(deliveryEndOf(closed, none)).toBe(undefined);
    expect(deliveryEndOf(proposal, none)).toBe(undefined);
    expect(deliveryEndOf(memo('m_20261117_gggggg', { to: { route: 'quests', quests: [] } }), none)).toBe(
      'lapsed',
    );
  });
});

describe('MemoSchema of a memo to quests (PS-09c)', () => {
  const issues = (over: Partial<Memo> | Record<string, unknown>) => {
    const parsed = MemoSchema.safeParse({ ...memo('m_20261117_aaaaaa'), ...over });
    return parsed.success ? [] : parsed.error.issues.map(({ message }) => message);
  };

  it('needs the quests with the route, and only with it', () => {
    expect(issues({ to: { route: 'quests' } })).toEqual([
      'a memo to quests names them, and only such a memo',
    ]);
    expect(issues({ to: { route: 'chancellor', quests: [A] } })).toEqual([
      'a memo to quests names them, and only such a memo',
    ]);
  });

  it('is read by the quests it went to only, and only it is delivered or lapses', () => {
    const stranger = { quest: C, attempt: 1, at: AT };
    expect(issues({ deliveries: [stranger] })).toEqual(['a memo is read by the quests it went to']);
    const proposal = { kind: 'proposal', to: { route: 'chancellor' }, state: 'closed' };
    expect(issues({ ...proposal, outcome: { decision: 'delivered', at: AT } })).toEqual([
      'only a memo to quests is delivered or lapses',
    ]);
    expect(issues({ state: 'closed', outcome: { decision: 'shelved', at: AT } })).toEqual([]);
  });

  it('may have no writer: the Steward wrote it', () => {
    expect(issues({ from: undefined })).toEqual([]);
    expect(issues({ from: 'thorn' })).toEqual([]);
  });
});
