// The two tables of P2-01 (ADR 0037): the group of each command (ADR 0031 item 5, B3) and what it reaches.
import { describe, expect, it } from 'vitest';

import { InboxCommandSchema } from '../schema/command/inbox-command.ts';
import { AWAY, HOME, M_HOME, Q_AWAY, Q_HOME } from './__fixtures__/world.ts';
import { COMMAND_GROUPS, commandGroupOf } from './groups.ts';
import { COMMAND_SCOPES, commandScopeOf } from './scopes.ts';
import type { MemoId, QuestId, TerritoryId } from '../core/ids.ts';
import type { InboxCommand } from '../schema/command/inbox-command.ts';

const KINDS = InboxCommandSchema.options.map(({ shape }) => shape.kind.value).sort();

const command = (kind: string, payload: Record<string, unknown>): InboxCommand =>
  InboxCommandSchema.parse({
    version: 1,
    id: '01M6QC00000000000000000001',
    ts: '2026-11-26T09:00:00+07:00',
    kind,
    source: 'herald',
    payload,
  });

const QUEST_ADD = {
  draft: false,
  title: 'Count the links',
  description: 'Count the links of the README.',
  kind: 'research',
  rank: 'E',
  territory: HOME,
  class_required: 'scout',
  created_by: 'user',
};
const edit = (changes: Record<string, unknown>) =>
  command('edit_quest', { quest: Q_HOME.id, expected_updated_at: '2026-11-26T08:00:00+07:00', changes });

const LOOKUP = {
  territoryOf: (quest: QuestId): TerritoryId | undefined => ({ [Q_HOME.id]: HOME, [Q_AWAY.id]: AWAY })[quest],
  questOf: (memo: MemoId): QuestId | undefined => (memo === M_HOME.id ? Q_HOME.id : undefined),
};
/** The scope with its territories in name order: which comes first says nothing. */
const placed = (scope: ReturnType<typeof commandScopeOf>) =>
  scope === 'kingdom' ? scope : [...scope].sort();
const scopeOf = (kind: string, payload: Record<string, unknown>) =>
  placed(commandScopeOf(command(kind, payload), LOOKUP));

describe('the tables of commands', () => {
  it('have a row for every kind of the inbox contract, and nothing else', () => {
    expect(Object.keys(COMMAND_GROUPS).sort()).toEqual(KINDS);
    expect(Object.keys(COMMAND_SCOPES).sort()).toEqual(KINDS);
  });
});

describe('commandGroupOf', () => {
  it('puts everyday work in group 1, heavy consequences in 2, the trusted configuration in 3 (B3)', () => {
    expect(commandGroupOf(command('retry', { quest: Q_HOME.id }))).toBe(1);
    expect(commandGroupOf(command('answer', { quest: Q_HOME.id, answer: 'Yes.' }))).toBe(1);
    expect(commandGroupOf(command('seal', { quest: Q_HOME.id }))).toBe(2);
    expect(commandGroupOf(command('deliver', { quest: Q_HOME.id }))).toBe(2);
    expect(commandGroupOf(command('enqueue_branch', { territory: HOME, pr: 7 }))).toBe(2);
    expect(commandGroupOf(command('set_level', { character: 'thorn', level: 5 }))).toBe(2);
    expect(commandGroupOf(command('attach_territory', { path: 'D:/Work/repo' }))).toBe(3);
    expect(commandGroupOf(command('resume_delegation', { territory: HOME }))).toBe(3);
  });

  it('raises a new quest that skips the seal to group 2, and one that names secrets to group 3', () => {
    expect(commandGroupOf(command('create_quest', QUEST_ADD))).toBe(1);
    expect(commandGroupOf(command('create_quest', { ...QUEST_ADD, seal_required: true }))).toBe(1);
    expect(commandGroupOf(command('create_quest', { ...QUEST_ADD, seal_required: false }))).toBe(2);
    expect(commandGroupOf(command('create_quest', { ...QUEST_ADD, secrets_required: [] }))).toBe(1);
    const secret = { ...QUEST_ADD, seal_required: false, secrets_required: ['npm_token'] };
    expect(commandGroupOf(command('create_quest', secret))).toBe(3);
  });

  it('raises an edit of the token or attempt ceiling, or one that turns the seal off, to group 2', () => {
    expect(commandGroupOf(edit({ title: 'Count every link' }))).toBe(1);
    expect(commandGroupOf(edit({ budget: { max_minutes: 90 } }))).toBe(1);
    expect(commandGroupOf(edit({ seal_required: true }))).toBe(1);
    expect(commandGroupOf(edit({ budget: { max_tokens: 400_000 } }))).toBe(2);
    expect(commandGroupOf(edit({ budget: { max_attempts: 5 } }))).toBe(2);
    expect(commandGroupOf(edit({ seal_required: false }))).toBe(2);
  });
});

describe('commandScopeOf', () => {
  it('reaches the territory a command names, or the territory of its quest', () => {
    expect(scopeOf('patrol', { territory: AWAY })).toEqual([AWAY]);
    expect(scopeOf('seal', { quest: Q_HOME.id })).toEqual([HOME]);
    expect(scopeOf('reassign', { quest: Q_AWAY.id, character: 'thorn' })).toEqual([AWAY]);
  });

  it('reaches every territory of the quests and memos a payload names, each once', () => {
    expect(scopeOf('create_quest', { ...QUEST_ADD, depends_on: [Q_HOME.id, Q_AWAY.id] })).toEqual([
      HOME,
      AWAY,
    ]);
    expect(scopeOf('create_quest', { ...QUEST_ADD, parent_id: Q_HOME.id, memos: [M_HOME.id] })).toEqual([
      HOME,
    ]);
    expect(scopeOf('decide_memo', { memo: M_HOME.id, decision: 'handled', quest: Q_AWAY.id })).toEqual([
      HOME,
      AWAY,
    ]);
    expect(scopeOf('decide_memo', { memo: M_HOME.id, decision: 'shelved' })).toEqual([HOME]);
    const scoped = edit({ depends_on: [Q_AWAY.id] });
    expect(placed(commandScopeOf(scoped, LOOKUP))).toEqual([HOME, AWAY]);
    expect(commandScopeOf(edit({ title: 'Count', depends_on: undefined }), LOOKUP)).toEqual([HOME]);
  });

  it('is the whole kingdom for what no territory holds, and for a quest or memo it cannot place', () => {
    expect(scopeOf('wake', { tribe: 'claude' })).toBe('kingdom');
    expect(scopeOf('set_model', { character: 'thorn', model: 'claude-sonnet-5-5' })).toBe('kingdom');
    expect(scopeOf('attach_territory', { path: 'D:/Work/repo' })).toBe('kingdom');
    expect(scopeOf('create_quest', { ...QUEST_ADD, campaign_id: 'c_20261106_a1b2c3' })).toBe('kingdom');
    expect(scopeOf('seal', { quest: 'q_20261106_zzzzzz' })).toBe('kingdom');
    expect(scopeOf('decide_memo', { memo: 'm_20261106_zzzzzz', decision: 'shelved' })).toBe('kingdom');
  });
});
