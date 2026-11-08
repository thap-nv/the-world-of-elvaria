import { describe, expect, expectTypeOf, it } from 'vitest';

import examples from '../../../examples/inbox-command.json' with { type: 'json' };
import { contractOf } from '../json-schema.ts';
import { InboxCommandSchema } from './inbox-command.ts';
import type { TagId } from '../../core/ids.ts';
import type { CommandPayload, InboxCommandKind } from './inbox-command.ts';

const QUEST = 'q_20261106_7k3m2a';
const TS = '2026-11-06T19:45:00+07:00';
const SESSION_QUEST = {
  draft: false,
  title: 'Fix the login redirect',
  description: 'After login the user lands on /404.',
  kind: 'fix',
  rank: 'C',
  territory: 'dc1-se-team',
  class_required: 'knight',
  created_by: 'user',
};
const SCRIPT_QUEST = {
  ...SESSION_QUEST,
  class_required: undefined,
  tier: 'script',
  script: { id: 'link-check' },
};

const command = (kind: string, payload: unknown, change: Record<string, unknown> = {}) => ({
  version: 1,
  id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0A',
  ts: TS,
  kind,
  source: 'cli',
  payload,
  ...change,
});

const issuesOf = (value: unknown) => {
  const result = InboxCommandSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

// One valid and one invalid payload per kind, in the order of the contract; the type makes it name every kind.
const CASES: Record<InboxCommandKind, { valid: object; invalid: object; issue: string }> = {
  confirm: { valid: { quest: QUEST }, invalid: { quest: 'q_1' }, issue: 'payload.quest: Invalid string' },
  seal: {
    valid: { quest: QUEST },
    invalid: { quest: QUEST, note: 42 },
    issue: 'payload.note: Invalid input',
  },
  return: {
    valid: { quest: QUEST, notes: 'README still shows the old command.' },
    invalid: { quest: QUEST, notes: '' },
    issue: 'payload.notes: Too small',
  },
  retry: {
    valid: { quest: QUEST },
    invalid: { quest: QUEST, reason: 'again' },
    issue: 'Unrecognized key: "reason"',
  },
  cancel: {
    valid: { quest: QUEST, reason: 'not needed' },
    invalid: { reason: 'x' },
    issue: 'payload.quest: Invalid',
  },
  archive: {
    valid: { quest: QUEST },
    invalid: { quest: QUEST, reason: null },
    issue: 'payload.reason: Invalid',
  },
  summon: {
    valid: { character: 'thorn' },
    invalid: { character: 'Thorn' },
    issue: 'payload.character: Invalid',
  },
  wake: {
    valid: { tribe: 'gemini' },
    invalid: { tribe: 'gemini-cli' },
    issue: 'payload.tribe: Invalid string',
  },
  suspend: {
    valid: { character: 'thorn', reason: 'same failure three times' },
    invalid: { quest: QUEST },
    issue: 'payload.character: Invalid',
  },
  release: { valid: { character: 'thorn' }, invalid: {}, issue: 'payload.character: Invalid' },
  reassign: { valid: { quest: QUEST }, invalid: { quest: QUEST, character: '' }, issue: 'payload.character' },
  send_to_temple: {
    valid: { character: 'thorn' },
    invalid: { character: 'thorn', quest: QUEST },
    issue: 'Unrecognized key: "quest"',
  },
  declare_campaign: {
    valid: { name: 'Release 2.0', mode: 'offense', deadline: TS },
    invalid: { name: 'x'.repeat(61), mode: 'offense' },
    issue: 'payload.name: Too big',
  },
  close_campaign: {
    valid: { campaign: 'c_20261106_7k3m2a', outcome: 'won' },
    invalid: { campaign: 'c_20261106_7k3m2a', outcome: 'draw' },
    issue: 'payload.outcome: Invalid option',
  },
  create_quest: {
    valid: SESSION_QUEST,
    invalid: { ...SESSION_QUEST, rank: 'Z' },
    issue: 'payload.rank: Invalid',
  },
  answer: {
    valid: { quest: QUEST, answer: 'Use pnpm.' },
    invalid: { quest: QUEST, answer: '' },
    issue: 'payload.answer',
  },
  set_rank: {
    valid: { quest: QUEST, rank: 'S' },
    invalid: { quest: QUEST, rank: 'SS' },
    issue: 'payload.rank',
  },
  attach_territory: {
    valid: { path: 'D:/Dummy/Tool - DC1/dc1-se-team', name: 'dc1-se-team', id: 'dc1-se-team' },
    invalid: { path: String.raw`D:\Dummy\dc1-se-team` },
    issue: 'payload.path: Invalid string',
  },
  edit_quest: {
    valid: { quest: QUEST, expected_updated_at: TS, changes: { rank: 'B' } },
    invalid: { quest: QUEST, expected_updated_at: TS, changes: {} },
    issue: 'payload.changes: an edit changes at least one field',
  },
  pin_tag: {
    valid: { character: 'thorn', tag: null },
    invalid: { character: 'thorn' },
    issue: 'payload.tag',
  },
  set_level: {
    valid: { character: 'thorn', level: 10 },
    invalid: { character: 'thorn', level: 11 },
    issue: 'payload.level: Too big',
  },
  set_model: {
    valid: { character: 'quill', model: 'gemini-3.8-flash-high' },
    invalid: { character: 'quill', model: 'Gemini Flash' },
    issue: 'payload.model',
  },
};
const KINDS = Object.keys(CASES);

describe('InboxCommandSchema', () => {
  it.each(examples)('accepts the v1 example $kind unchanged', (example) => {
    expect(InboxCommandSchema.parse(example)).toEqual(example);
  });

  it.each(Object.entries(CASES))('accepts a valid %s payload', (kind, { valid }) => {
    expect(issuesOf(command(kind, valid))).toEqual([]);
  });

  it.each(Object.entries(CASES))('rejects an invalid %s payload', (kind, { invalid, issue }) => {
    expect(issuesOf(command(kind, invalid)).join('\n')).toContain(issue);
  });

  it('checks the payload against its own kind, not any kind', () => {
    expect(issuesOf(command('seal', CASES.return.valid)).join('\n')).toContain('Unrecognized key: "notes"');
  });

  it.each([
    ['an unknown kind', { kind: 'approve' }, 'kind: Invalid discriminator value'],
    ['a command of another version', { version: 2 }, 'version: Invalid input: expected 1'],
    ['an unknown source', { source: 'phone' }, 'source: Invalid option'],
    ['an id that is not a ULID', { id: '42' }, 'id: Invalid string'],
    ['a timestamp without offset', { ts: '2026-11-06T19:45:00' }, 'ts: Invalid ISO datetime'],
    ['a field outside the contract', { quest: QUEST }, 'Unrecognized key: "quest"'],
    ['a command without payload', { payload: undefined }, 'payload: Invalid input'],
  ])('rejects %s', (_, change, expected) => {
    expect(issuesOf(command('confirm', CASES.confirm.valid, change)).join('\n')).toContain(expected);
  });
});

describe('create_quest payload', () => {
  const payloadOf = (payload: object) => {
    const parsed = InboxCommandSchema.parse(command('create_quest', payload));
    return parsed.kind === 'create_quest' ? parsed.payload : undefined;
  };

  it('fills the contract defaults: a session quest without tags', () => {
    expect(payloadOf(SESSION_QUEST)).toEqual({ ...SESSION_QUEST, tier: 'session', tags: [] });
    expect(payloadOf(SCRIPT_QUEST)?.script).toEqual({ id: 'link-check', params: {} });
  });

  it('needs script for the script tier, and class_required otherwise', () => {
    expect(issuesOf(command('create_quest', { ...SCRIPT_QUEST, script: undefined }))).toEqual([
      'payload.script: a script-tier quest needs script',
    ]);
    const { class_required: _, ...unclassed } = SESSION_QUEST;
    expect(issuesOf(command('create_quest', unclassed))).toEqual([
      'payload.class_required: a session-tier quest needs class_required',
    ]);
    expect(issuesOf(command('create_quest', { ...unclassed, tier: 'session' }))).toHaveLength(1);
  });

  it('takes an assignee only for a session-tier quest created open', () => {
    expect(payloadOf({ ...SESSION_QUEST, assignee: 'ember' })?.assignee).toBe('ember');
    const refused = ['payload.assignee: an assignee needs a session-tier quest created open'];
    expect(issuesOf(command('create_quest', { ...SESSION_QUEST, draft: true, assignee: 'ember' }))).toEqual(
      refused,
    );
    expect(issuesOf(command('create_quest', { ...SCRIPT_QUEST, assignee: 'ember' }))).toEqual(refused);
    expect(issuesOf(command('create_quest', { ...SESSION_QUEST, assignee: 'Ember' })).join()).toContain(
      'payload.assignee',
    );
  });

  it.each([
    ['seven tags', { tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, 'payload.tags: Too big'],
    ['a tag twice', { tags: ['docs', 'docs'] }, 'payload.tags: items must be unique'],
    ['a secret twice', { secrets_required: ['npm_token', 'npm_token'] }, 'items must be unique'],
    ['a dependency twice', { depends_on: [QUEST, QUEST] }, 'payload.depends_on: items must be unique'],
    ['a part, which only the Steward creates', { party_role: 'part' }, 'payload.party_role'],
    ['a long follow-up question', { question: 'x'.repeat(301) }, 'payload.question: Too big'],
    ['a title over 120 characters', { title: 'x'.repeat(121) }, 'payload.title: Too big'],
    ['an unknown creator', { created_by: 'herald' }, 'payload.created_by'],
    ['a negative estimate', { estimate: { tokens: -1, minutes: 2 } }, 'payload.estimate.tokens'],
  ])('rejects %s', (_, change, expected) => {
    expect(issuesOf(command('create_quest', { ...SESSION_QUEST, ...change })).join('\n')).toContain(expected);
  });
});

describe('edit_quest payload', () => {
  const edit = (changes: object) => command('edit_quest', { quest: QUEST, expected_updated_at: TS, changes });

  it('accepts every editable field', () => {
    const budget = { max_minutes: 45, max_tokens: 0, max_attempts: 3 };
    expect(
      issuesOf(edit({ title: 't', description: 'd', seal_required: true, depends_on: [], budget })),
    ).toEqual([]);
  });

  it.each([
    ['a field that cannot be edited', { status: 'done' }, 'Unrecognized key: "status"'],
    ['a budget of zero minutes', { budget: { max_minutes: 0 } }, 'payload.changes.budget.max_minutes'],
    ['an empty title', { title: '' }, 'payload.changes.title: Too small'],
  ])('rejects %s', (_, changes, expected) => {
    expect(issuesOf(edit(changes)).join('\n')).toContain(expected);
  });
});

describe('inbox command narrowing', () => {
  it('narrows payload by kind', () => {
    const parsed = examples.map((example) => InboxCommandSchema.parse(example));
    const seen = parsed.map((command) => {
      switch (command.kind) {
        case 'seal':
          expectTypeOf(command.payload.note).toEqualTypeOf<string | undefined>();
          return command.payload.quest;
        case 'create_quest':
          expectTypeOf(command.payload.tier).toEqualTypeOf<'script' | 'session'>();
          return command.payload.tier;
        default:
          return command.kind;
      }
    });
    expect(seen).toEqual([QUEST, 'script', 'return', 'pin_tag', 'set_level', 'set_model', 'session']);
    expectTypeOf<CommandPayload<'pin_tag'>['tag']>().toEqualTypeOf<TagId | null>();
  });
});

describe('inbox-command contract', () => {
  interface JsonNode {
    allOf?: unknown[];
    anyOf?: unknown[];
    properties?: Record<string, JsonNode>;
    const?: unknown;
  }
  const branches = contractOf('inbox-command', InboxCommandSchema).oneOf as JsonNode[];
  const payloadOf = (kind: string) =>
    branches.find((branch) => branch.properties?.kind?.const === kind)?.properties?.payload;

  it('has one branch per kind, each fixing kind, in the order of v1', () => {
    expect(branches.map((branch) => branch.properties?.kind?.const)).toEqual(KINDS);
  });

  it('keeps the rules zod checks in refinements', () => {
    expect(payloadOf('create_quest')?.allOf).toHaveLength(3);
    expect(payloadOf('edit_quest')?.properties?.changes?.anyOf).toEqual(
      ['title', 'description', 'rank', 'seal_required', 'depends_on', 'budget'].map((field) => ({
        required: [field],
      })),
    );
  });
});
