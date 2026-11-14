import { describe, expect, it } from 'vitest';

import { InboxCommandSchema } from '../schema/command/inbox-command.ts';
import { KINGDOM, Q1, Q2, TERRITORY, at, character } from './__fixtures__/snapshot.ts';
import { questFromCommand, secretsBeyond } from './new-quest.ts';
import type { CommandPayload } from '../schema/command/inbox-command.ts';
import type { NewQuestContext } from './new-quest.ts';
import type { PartyPlace } from '../party/party-place.ts';

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
        // No estimate: its rank's share of the context budget stands in for it (two at rank D, P1-54), times the
        // mana multiplier.
        estimate: { tokens: 240000, minutes: 45 },
        budget: { max_minutes: 45, max_tokens: 480000, max_attempts: 3 },
        created_at: at(5),
        updated_at: at(5),
      },
    });
  });

  // P1-38, P1-21 (j): one context budget was too little for the contract quest and the parts of a party; P1-45:
  // the rank C sessions of P1-37 spent up to 319 000 and past 322 000, so C takes two budgets, as B.
  it('gives a quest of a higher rank without an estimate a larger stand-in, from rank C up', () => {
    const ceilingOf = (rank: string, breakers = CONTEXT.breakers) => {
      const made = questFromCommand(payload({ rank }), { ...CONTEXT, breakers });
      if (!made.ok) throw new Error(made.error.code);
      return [made.value.estimate.tokens, made.value.budget.max_tokens];
    };
    expect(ceilingOf('E')).toEqual([120_000, 240_000]);
    // P1-54: rank D sessions on dc1 spent 243 000–255 000 in P1-50, rank C and B 450 000–500 000.
    expect(ceilingOf('D')).toEqual([240_000, 480_000]);
    expect(ceilingOf('C')).toEqual([360_000, 720_000]);
    expect(ceilingOf('B')).toEqual([360_000, 720_000]);
    // P1-56: the owner's floors for the two ranks nobody measured, 960 000 and 1 530 000 at the defaults.
    expect(ceilingOf('A')).toEqual([480_000, 960_000]);
    expect(ceilingOf('S')).toEqual([765_000, 1_530_000]);
    // An odd budget still gives a whole estimate (S: 120 001 × 6.375 = 765 006.375).
    const odd = { ...CONTEXT.breakers, context_budget_tokens: 120_001 };
    expect(ceilingOf('A', odd)).toEqual([480_004, 960_008]);
    expect(ceilingOf('S', odd)).toEqual([765_006, 1_530_012]);
  });

  it('gives a high rank the long time limit, and keeps the estimate and seal it was given', () => {
    const made = questFromCommand(
      payload({ rank: 'B', estimate: { tokens: 300000, minutes: 20 }, seal_required: false }),
      CONTEXT,
    );
    expect(made).toMatchObject({
      ok: true,
      value: {
        seal_required: false,
        budget: { max_minutes: 120, max_tokens: 720000 },
        estimate: { tokens: 300000, minutes: 20 },
      },
    });
  });

  // P1-45, P1-37 (e): the mage guessed 160 000 tokens and 80 minutes for a rank C part; its first session was cut at
  // 322 143 of 320 000, and it had 45 minutes.
  it("never gives a draft's estimate a lower ceiling than its rank's, nor fewer minutes than it estimates", () => {
    const budgetOf = (rank: string, estimate: { tokens: number; minutes: number }) => {
      const made = questFromCommand(payload({ draft: true, rank, estimate }), CONTEXT);
      if (!made.ok) throw new Error(made.error.code);
      return [made.value.estimate, made.value.budget.max_tokens, made.value.budget.max_minutes];
    };
    const low = { tokens: 160_000, minutes: 80 };
    expect(budgetOf('C', low)).toEqual([low, 720_000, 80]);
    // An estimate above the rank's share keeps its own ceiling; one below the rank's minutes keeps the rank's.
    const high = { tokens: 400_000, minutes: 20 };
    expect(budgetOf('C', high)).toEqual([high, 800_000, 45]);
    // The minutes stop at attempt_minutes.high: exclusiveWaitMinutes waits that long for a judge holding the lock.
    expect(budgetOf('E', { tokens: 0, minutes: 200 })).toEqual([{ tokens: 0, minutes: 200 }, 240_000, 120]);
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

  it("places a part or a merge quest the Steward makes in the contract's party, over any role of the payload", () => {
    const party = { id: Q2, role: 'part', contract: 'apps/api/openapi.yaml' } as const;
    const made = questFromCommand(payload({ party_role: 'contract', depends_on: [Q2] }), {
      ...CONTEXT,
      party,
    });
    expect(made).toMatchObject({
      ok: true,
      value: {
        id: Q1,
        party_id: Q2,
        party_role: 'part',
        contract: 'apps/api/openapi.yaml',
        depends_on: [Q2],
      },
    });
    const merge = questFromCommand(payload({ depends_on: [Q2] }), {
      ...CONTEXT,
      party: { ...party, role: 'merge' },
    });
    expect(merge).toMatchObject({ ok: true, value: { party_id: Q2, party_role: 'merge' } });
  });

  // Gap 9 of the PS-07 report: every part of a build kind waited for the seal, and the party stood two hours on d1's.
  it("waits for no seal on a part that leaves it out, whatever its kind's default, and keeps a part's own seal", () => {
    const sealOf = (fields: Record<string, unknown>, party?: Partial<PartyPlace>) => {
      const place = { id: Q2, role: 'part', contract: 'apps/api/openapi.yaml', ...party } as const;
      const made = questFromCommand(
        payload(fields),
        party === undefined ? CONTEXT : { ...CONTEXT, party: place },
      );
      if (!made.ok) throw new Error(made.error.code);
      return made.value.seal_required;
    };
    expect(sealOf({}, {})).toBe(false);
    expect(sealOf({}, { role: 'acceptance' })).toBe(false);
    expect(sealOf({ seal_required: true }, {})).toBe(true);
    // Outside a party, and for the merge quest, the kind's default stands: `build` is sealed.
    expect(sealOf({})).toBe(true);
    expect(sealOf({}, { role: 'merge' })).toBe(true);
    expect(sealOf({ kind: 'research', class_required: 'scout' }, { role: 'merge' })).toBe(false);
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
