// The seal of a new quest under the kingdom's delegation (PS-08b, K9 (4)): spared when the command says nothing, the
// owner's word wins, and the owner's later edit of seal_required ends the delegation.
import { describe, expect, it } from 'vitest';

import { InboxCommandSchema } from '../schema/command/inbox-command.ts';
import { KINGDOM, Q1, Q2, TERRITORY, at } from './__fixtures__/snapshot.ts';
import { editQuest, questFromCommand } from './new-quest.ts';
import type { KindId } from '../core/ids.ts';
import type { CommandPayload } from '../schema/command/inbox-command.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { TerritoryDelivery } from '../schema/territory-delivery.ts';
import type { NewQuestContext } from './new-quest.ts';

const REGISTRY = {
  kinds: [
    { id: 'fix', classes_allowed: ['knight'], deliverable_type: 'branch', seal_default: true },
    { id: 'research', classes_allowed: ['scout'], deliverable_type: 'report', seal_default: false },
  ],
  tags: [],
  scripts: [],
} as unknown as NewQuestContext['registry'];

const PR_MERGE: TerritoryDelivery = {
  mode: 'pr_merge',
  forge: 'github',
  merge_method: 'merge',
  required_checks: [],
  checks_timeout_minutes: 60,
};

const CONTEXT: NewQuestContext = {
  id: Q1,
  at: at(5),
  breakers: KINGDOM.breakers,
  registry: REGISTRY,
  territories: [{ id: TERRITORY, secrets_allowed: [], delivery: PR_MERGE }],
  quests: [Q2],
  seal: { seal: { max_rank: 'D', kinds: ['fix' as KindId], max_diff_lines: 400 } },
};

function payload(fields: Record<string, unknown> = {}): CommandPayload<'create_quest'> {
  const command = InboxCommandSchema.parse({
    version: 1,
    id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0A',
    ts: at(5),
    kind: 'create_quest',
    source: 'cli',
    payload: {
      draft: false,
      title: 'Fix the sign-in link',
      description: 'The link in the sign-in mail points to the old host.',
      kind: 'fix',
      rank: 'D',
      territory: TERRITORY,
      class_required: 'knight',
      tags: [],
      created_by: 'user',
      ...fields,
    },
  });
  if (command.kind !== 'create_quest') throw new Error('fixture');
  return command.payload;
}

const sealOf = (fields: Record<string, unknown>, context: Partial<NewQuestContext> = {}) => {
  const made = questFromCommand(payload(fields), { ...CONTEXT, ...context });
  if (!made.ok) throw new Error(made.error.code);
  return { required: made.value.seal_required, delegated: made.value.seal_delegated };
};

describe('questFromCommand under the delegation of the seal', () => {
  it('spares a fix of rank D on a pr_merge territory whose command says nothing of the seal', () => {
    expect(sealOf({})).toEqual({ required: false, delegated: true });
  });

  it("keeps the owner's word, either way, without the delegation's mark", () => {
    expect(sealOf({ seal_required: true })).toEqual({ required: true, delegated: undefined });
    expect(sealOf({ seal_required: false })).toEqual({ required: false, delegated: undefined });
  });

  it('keeps the seal of a quest above max_rank, or on a territory that does not merge by itself', () => {
    expect(sealOf({ rank: 'C' })).toEqual({ required: true, delegated: undefined });
    const manual = { territories: [{ id: TERRITORY, secrets_allowed: [] }] };
    expect(sealOf({}, manual)).toEqual({ required: true, delegated: undefined });
  });

  it('keeps the seal of a place in a party, and a kind that does not seal stays unsealed without the mark', () => {
    expect(sealOf({ party_role: 'contract' })).toEqual({ required: true, delegated: undefined });
    expect(sealOf({ kind: 'research', class_required: 'scout' })).toEqual({
      required: false,
      delegated: undefined,
    });
  });

  it('changes nothing without a delegation, as for the quests the Steward makes itself', () => {
    const { seal: _, ...without } = CONTEXT;
    expect(questFromCommand(payload(), without)).toMatchObject({ ok: true, value: { seal_required: true } });
    expect(sealOf({}, { seal: {} })).toEqual({ required: true, delegated: undefined });
  });

  it('keeps the seal default on a territory whose delegation is suspended', () => {
    const seal = { ...CONTEXT.seal, suspended: [TERRITORY] };
    expect(sealOf({}, { seal })).toEqual({ required: true, delegated: undefined });
  });
});

describe('editQuest of a quest the delegation spared', () => {
  const made = questFromCommand(payload(), CONTEXT);
  if (!made.ok) throw new Error('fixture');
  const spared: Quest = { ...made.value, seal_required: true, seal_raised: ['diff_size'] };

  const edit = (changes: Record<string, unknown>) => {
    const command = InboxCommandSchema.parse({
      version: 1,
      id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0B',
      ts: at(9),
      kind: 'edit_quest',
      source: 'cli',
      payload: { quest: Q1, expected_updated_at: spared.updated_at, changes },
    });
    if (command.kind !== 'edit_quest') throw new Error('fixture');
    const edited = editQuest(spared, command.payload, { at: at(10), quests: [Q1, Q2] });
    if (!edited.ok) throw new Error(edited.error.code);
    return edited.value;
  };

  it("ends the delegation when the owner says seal_required, the machine's reasons with it", () => {
    const lowered = edit({ seal_required: false });
    expect(lowered).toMatchObject({ seal_required: false });
    expect(lowered.seal_delegated).toBeUndefined();
    expect(lowered.seal_raised).toBeUndefined();
  });

  it('keeps the delegation through any other edit', () => {
    expect(edit({ title: 'Fix the sign-in link again' })).toMatchObject({
      seal_required: true,
      seal_delegated: true,
      seal_raised: ['diff_size'],
    });
  });
});
