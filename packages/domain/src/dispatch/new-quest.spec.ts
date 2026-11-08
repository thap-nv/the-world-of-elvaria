import { describe, expect, it } from 'vitest';

import { InboxCommandSchema } from '../schema/command/inbox-command.ts';
import { KINGDOM, Q1, Q2, TERRITORY, at, character, quest } from './__fixtures__/snapshot.ts';
import { editQuest, questFromCommand, secretsBeyond, setRank } from './new-quest.ts';
import type { CommandPayload } from '../schema/command/inbox-command.ts';
import type { NewQuestContext } from './new-quest.ts';

const REGISTRY = {
  kinds: [
    { id: 'build', classes_allowed: ['knight', 'dwarf'], deliverable_type: 'branch', seal_default: true },
    { id: 'research', classes_allowed: ['scout'], deliverable_type: 'report', seal_default: false },
    { id: 'batch', classes_allowed: ['knight'], deliverable_type: 'report', seal_default: false },
  ],
  tags: [{ id: 'frontend' }, { id: 'i18n' }],
  scripts: [
    {
      id: 'link-check',
      kinds: ['batch'],
      params_schema: {
        type: 'object',
        required: ['globs'],
        properties: { globs: { type: 'array', items: { type: 'string' }, minItems: 1 } },
        additionalProperties: false,
      },
    },
  ],
} as unknown as NewQuestContext['registry'];

const LINKS = { id: 'link-check', params: { globs: ['docs/**/*.md'] } };

const CONTEXT: NewQuestContext = {
  id: Q1,
  at: at(5),
  breakers: KINGDOM.breakers,
  registry: REGISTRY,
  territories: [{ id: TERRITORY, secrets_allowed: ['npm_token'] }],
  quests: [Q2],
  // The example kingdom enables claude and gemini, not codex.
  characters: [
    character('ember', { level: 1 }),
    character('wren', { cls: 'scribe' }),
    character('rook', { status: 'suspended' }),
    character('vex', { tribe: 'codex' }),
  ],
  tribes: KINGDOM.tribes,
};

/** A create_quest payload as the inbox parses it, defaults filled. */
function payload(fields: Record<string, unknown> = {}): CommandPayload<'create_quest'> {
  const command = InboxCommandSchema.parse({
    version: 1,
    id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0A',
    ts: at(5),
    kind: 'create_quest',
    source: 'cli',
    payload: {
      draft: false,
      title: 'Add a sign-in page',
      description: 'A page to sign in with a magic link.',
      kind: 'build',
      rank: 'D',
      territory: TERRITORY,
      class_required: 'knight',
      tags: ['frontend'],
      created_by: 'user',
      ...fields,
    },
  });
  if (command.kind !== 'create_quest') throw new Error('fixture');
  return command.payload;
}

describe('questFromCommand', () => {
  it('opens a quest with the defaults of its kind and a budget from the breakers', () => {
    const made = questFromCommand(payload(), CONTEXT);
    expect(made).toMatchObject({
      ok: true,
      value: {
        id: Q1,
        status: 'open',
        tier: 'session',
        seal_required: true,
        deliverable: { type: 'branch' },
        plot: { type: 'none' },
        // No estimate: the context budget of one quest stands in for it, times the mana multiplier.
        estimate: { tokens: 120000, minutes: 45 },
        budget: { max_minutes: 45, max_tokens: 240000, max_attempts: 3 },
        created_at: at(5),
        updated_at: at(5),
      },
    });
  });

  it('gives a high rank the long time limit, and keeps the estimate and seal it was given', () => {
    const made = questFromCommand(
      payload({ rank: 'B', estimate: { tokens: 50000, minutes: 20 }, seal_required: false }),
      CONTEXT,
    );
    expect(made).toMatchObject({
      ok: true,
      value: {
        seal_required: false,
        budget: { max_minutes: 120, max_tokens: 100000 },
        estimate: { tokens: 50000 },
      },
    });
  });

  it("makes a draft of the Chancellor's, with its question, and a contract quest that heads its party", () => {
    const made = questFromCommand(
      payload({ draft: true, question: 'Which page first?', party_role: 'contract', depends_on: [Q2] }),
      CONTEXT,
    );
    expect(made).toMatchObject({
      ok: true,
      value: {
        status: 'draft',
        party_id: Q1,
        party_role: 'contract',
        blocked: { question: 'Which page first?' },
      },
    });
  });

  it('keeps the secrets its territory allows, and names the ones it does not', () => {
    expect(questFromCommand(payload({ secrets_required: ['npm_token'] }), CONTEXT)).toMatchObject({
      ok: true,
      value: { secrets_required: ['npm_token'] },
    });
    expect(secretsBeyond(['npm_token', 'aws_key'], { secrets_allowed: ['npm_token'] })).toEqual(['aws_key']);
    expect(secretsBeyond([], { secrets_allowed: [] })).toEqual([]);
  });

  it('makes a script-tier quest without a class', () => {
    const script = payload({
      kind: 'batch',
      tier: 'script',
      class_required: undefined,
      script: LINKS,
    });
    expect(questFromCommand(script, CONTEXT)).toMatchObject({
      ok: true,
      value: { tier: 'script', assignee: null, script: LINKS },
    });
  });

  it.each([
    ['unknown_kind', { kind: 'conquer' }],
    ['unknown_territory', { territory: 'atlas' }],
    ['secret_not_allowed', { secrets_required: ['npm_token', 'aws_key'] }],
    ['class_not_allowed', { class_required: 'scribe' }],
    ['unknown_tag', { tags: ['db'] }],
    ['unknown_script', { kind: 'batch', tier: 'script', class_required: undefined, script: { id: 'nope' } }],
    ['script_not_for_kind', { tier: 'script', class_required: undefined, script: LINKS }],
    // The params a model wrote must fit the catalog's params_schema before the script ever runs (§3.12).
    [
      'invalid_script_params',
      { kind: 'batch', tier: 'script', class_required: undefined, script: { id: 'link-check' } },
    ],
    [
      'invalid_script_params',
      {
        kind: 'batch',
        tier: 'script',
        class_required: undefined,
        script: { ...LINKS, params: { globs: [], x: 1 } },
      },
    ],
    ['unknown_dependency', { depends_on: ['q_20261106_zzzzzz'] }],
    // The owner's assignee (P1-29): a quest nobody named could take is never created.
    ['unknown_character', { assignee: 'nobody' }],
    ['class_mismatch', { assignee: 'wren' }],
    ['character_suspended', { assignee: 'rook' }],
    ['tribe_disabled', { assignee: 'vex' }],
  ])('refuses %s', (code, fields) => {
    expect(questFromCommand(payload(fields), CONTEXT)).toEqual({ ok: false, error: { code } });
  });

  it('opens a quest for a named assignee, its level aside: the Steward then gives it by a reassign', () => {
    // ember is level 1 (ceiling F) and the quest rank D: the owner's choice is not bound by canTake.
    const made = questFromCommand(payload({ assignee: 'ember' }), CONTEXT);
    expect(made).toMatchObject({ ok: true, value: { status: 'open', assignee: null } });
    // A context without the roster (the Steward's own quests) knows nobody to give a quest to.
    const { characters: _, tribes: __, ...bare } = CONTEXT;
    expect(questFromCommand(payload({ assignee: 'ember' }), bare)).toEqual({
      ok: false,
      error: { code: 'unknown_character' },
    });
  });

  it('refuses what the quest schema refuses, with its issues', () => {
    const made = questFromCommand(payload(), { ...CONTEXT, at: 'yesterday' });
    expect(made).toMatchObject({ ok: false, error: { code: 'invalid_quest' } });
  });
});

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

  it('sets the rank, never on an archived quest', () => {
    expect(setRank(base, 'C', at(40))).toMatchObject({ ok: true, value: { rank: 'C' } });
    const archived = { ...base, status: 'archived' as const };
    expect(setRank(archived, 'C', at(40))).toEqual({ ok: false, error: { code: 'archived' } });
  });
});
