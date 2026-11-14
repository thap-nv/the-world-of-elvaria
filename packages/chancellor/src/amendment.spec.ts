// amendmentCommand (PS-22b, ADR 0024): the author's decision held against kingdom.delegation and made the one
// decide_amendment command. fix/amendment-delegation: a party's author takes in, up to the plan's rank, an acceptance
// that only opens files of the contract (the Steward then rewrites nothing); files another quest holds go up (R3).
import { DelegationSchema } from '@elvaria/domain';
import type { Quest } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { DC1 } from './__fixtures__/kingdom.ts';
import { memoOf, questOf, sourceOf } from './__fixtures__/memos.ts';
import { amendmentCommand } from './amendment.ts';
import type { AmendmentInput } from './amendment.ts';

const CONTRACT_ID = 'q_20261112_cntrct';
/** The contract quest of a party, rank B, whose plan gave the party `apps/api/**`. */
const CONTRACT = questOf(CONTRACT_ID, {
  party_id: CONTRACT_ID,
  party_role: 'contract',
  rank: 'B',
  scope_paths: ['apps/api/**'],
});
const partOf = (id: string, scope: string, fields: Record<string, unknown> = {}): Quest =>
  questOf(id, {
    party_id: CONTRACT_ID,
    party_role: 'part',
    contract: 'apps/api/openapi.json',
    rank: 'C',
    scope_paths: [scope],
    ...fields,
  });
/** A part of rank C, above the delegation's D. */
const USERS = partOf('q_20261112_part01', 'apps/api/users/**');
/** A sibling part that ran once: it holds its scope (ADR 0028). */
const ORDERS = partOf('q_20261112_part02', 'apps/api/orders/**', { attempts: 1 });
type Decision = AmendmentInput['decision'];
const NOTE = 'Đúng: cần mở file đó.';

const inputOf = (over: Partial<AmendmentInput> = {}): AmendmentInput => ({
  decision: { decision: 'accepted', note: NOTE, ask: [], description: USERS.description },
  memo: memoOf('m_20261112_amd001', 'Cần sửa apps/api/auth/token.ts.', ['apps/api/auth/token.ts:12']),
  quest: USERS,
  quests: [CONTRACT, USERS, ORDERS],
  territory: { laws: DC1.laws, shared_paths: [] },
  delegation: DelegationSchema.parse({}),
  header: sourceOf().header(),
  ...over,
});

describe('amendmentCommand', () => {
  it("takes in a party part's acceptance that only opens files of the contract, rewriting nothing", () => {
    const { command, holds } = amendmentCommand(inputOf());
    expect(holds).toEqual([]);
    expect(command).toMatchObject({ kind: 'decide_amendment', source: 'chancellor' });
    expect(command.payload).toEqual({ memo: 'm_20261112_amd001', note: NOTE, decision: 'accepted' });
  });

  it('sends up a rewrite above the delegation’s rank, and lets one within it through', () => {
    const description = '## Goal\n\nMô tả mới.';
    const decision: Decision = { decision: 'accepted', note: NOTE, ask: [], description };
    expect(amendmentCommand(inputOf({ decision })).command.payload).toEqual({
      memo: 'm_20261112_amd001',
      note: NOTE,
      decision: 'owner',
      holds: ['above_rank'],
    });
    const small = { ...USERS, rank: 'D' } as const satisfies Quest;
    expect(amendmentCommand(inputOf({ decision, quest: small })).command.payload).toEqual({
      memo: 'm_20261112_amd001',
      note: NOTE,
      decision: 'accepted',
      description,
      expected_updated_at: USERS.updated_at,
    });
  });

  it('sends up files a sibling part holds (R3), and keeps a rejection', () => {
    const memo = memoOf('m_20261112_amd001', 'Cần sửa orders.', ['apps/api/orders/list.ts']);
    const { command, holds } = amendmentCommand(inputOf({ memo }));
    expect(holds).toEqual(['scope_held']);
    expect(command.payload).toMatchObject({ decision: 'owner', holds: ['scope_held'] });
    const shared = {
      laws: DC1.laws,
      shared_paths: [{ glob: 'apps/api/orders/**', merge: 'union' as const }],
    };
    expect(amendmentCommand(inputOf({ memo, territory: shared })).holds).toEqual(['above_rank']);
    const rejected: Decision = { decision: 'rejected', note: NOTE, ask: [] };
    expect(amendmentCommand(inputOf({ memo, decision: rejected })).command.payload).toEqual({
      memo: 'm_20261112_amd001',
      note: NOTE,
      decision: 'rejected',
    });
  });
});
