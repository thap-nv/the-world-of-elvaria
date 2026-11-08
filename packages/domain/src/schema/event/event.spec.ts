import { describe, expect, expectTypeOf, it } from 'vitest';

import examples from '../../../examples/event.json' with { type: 'json' };
import { CHARACTER_VIEW, QUEST_VIEW, TERRITORY_VIEW } from '../../world/__fixtures__/examples.ts';
import { contractOf } from '../json-schema.ts';
import { EVENT_DATA_SCHEMAS } from './event-data.ts';
import { EVENT_TYPES, isKnownEventType } from './event-types.ts';
import { EventSchema, isEventOf, isTypedEvent } from './event.ts';
import type { ToolKind, TypedEventType } from './event-data.ts';

const line = (type: string, data: Record<string, unknown>, change: Record<string, unknown> = {}) => ({
  v: 1,
  id: '01JCF8X4Z6Q3W9N2M5R7T8V0YB',
  ts: '2026-11-06T09:12:03+07:00',
  type,
  actor: { kind: 'steward' },
  data,
  ...change,
});

const issuesOf = (value: unknown) => {
  const result = EventSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

const ULID = '01JCFB7Q2R8S4T6V9W3X5Y1Z0A';

// The views of the v1 examples: what the Steward writes after a change (world/*-view.ts).
const QUEST_CHANGE = { quest: QUEST_VIEW, characters: [CHARACTER_VIEW] };
const CHARACTER_CHANGE = { character: CHARACTER_VIEW };
const TERRITORY_CHANGE = { territory: TERRITORY_VIEW };
const POOL = { tribe: 'gemini', pool: 'gemini_models' };

// One valid `data` per type that has a data schema: the table must name every one of them.
const VALID_DATA: Record<TypedEventType, Record<string, unknown>> = {
  'quest.drafted': QUEST_CHANGE,
  'quest.created': { quest: QUEST_VIEW },
  'quest.claimed': QUEST_CHANGE,
  'quest.released': QUEST_CHANGE,
  'quest.started': QUEST_CHANGE,
  'quest.submitted': QUEST_CHANGE,
  'quest.returned': QUEST_CHANGE,
  'quest.verdict': QUEST_CHANGE,
  'quest.done': QUEST_CHANGE,
  'quest.sealed': QUEST_CHANGE,
  'quest.archived': { ...QUEST_CHANGE, characters: [] },
  'quest.blocked': QUEST_CHANGE,
  'quest.unblocked': QUEST_CHANGE,
  'quest.paused': QUEST_CHANGE,
  'quest.resumed': QUEST_CHANGE,
  'quest.infirmary': { reason: 'breaker:time', ...QUEST_CHANGE },
  'quest.delivered': QUEST_CHANGE,
  'quest.edited': { quest: QUEST_VIEW },
  'quest.unclaimable': {
    reason: 'level_too_low',
    rank: 'A',
    class: 'knight',
    best_character: 'thorn',
    best_level: 5,
  },
  'character.created': CHARACTER_CHANGE,
  'character.sleep': CHARACTER_CHANGE,
  'character.wake': CHARACTER_CHANGE,
  'character.meditate': CHARACTER_CHANGE,
  'character.suspend': CHARACTER_CHANGE,
  'character.release': CHARACTER_CHANGE,
  'character.swamp': CHARACTER_CHANGE,
  'character.level_up': CHARACTER_CHANGE,
  'character.level_down': CHARACTER_CHANGE,
  'territory.attached': TERRITORY_CHANGE,
  'territory.surveyed': TERRITORY_CHANGE,
  'territory.health': TERRITORY_CHANGE,
  'mana.exhausted': POOL,
  'mana.restored': POOL,
  'agent.tool': { tool: 'bash', command: 'pnpm test', exit: 0, duration_ms: 5120, url: 'https://x.dev' },
  'agent.tool.blocked': { tool: 'write', reason: 'forbidden path .env' },
  'agent.session.start': { session: 'abc-123', model: 'claude-opus-4.1' },
  'agent.session.end': { outcome: 'completed', usage: { tokens: 18_000, turns: 12 } },
  'agent.subagent.end': { agent_type: 'apprentice', duration_ms: 90_000, stopped: 'max_turns' },
  'agent.subagent.overrun': { agent_type: 'apprentice', duration_ms: 400_000, limit_minutes: 5 },
  'mana.signal': { error: 'rate_limit', source: 'stop_failure' },
  'mana.level': { tribe: 'claude', pool: 'claude', window: 'weekly', used_pct: 0, source: 'estimate' },
  'command.applied': { command_id: ULID },
  'command.rejected': { command_id: ULID, reason: 'quest is not awaiting_seal' },
  'plot.patched': { file: 'elvaria.patch', paths: ['.husky/pre-push'] },
};

describe('EventSchema', () => {
  it.each(examples)('accepts the v1 example $type unchanged', (example) => {
    expect(EventSchema.parse(example)).toEqual(example);
  });

  it.each(Object.entries(VALID_DATA))('accepts valid data for %s', (type, data) => {
    expect(issuesOf(line(type, data))).toEqual([]);
  });

  it.each([
    ['agent.tool', { tool: 'read', path: 'src/a.ts', agent_type: 'apprentice' }],
    ['agent.tool.blocked', { tool: 'read', reason: '.env is a forbidden path', agent_type: 'apprentice' }],
    ['agent.subagent.end', { agent_type: 'apprentice', duration_ms: 3527 }],
  ])('accepts %s from a sub-agent, and the same line without the optional fields', (type, data) => {
    expect(issuesOf(line(type, data))).toEqual([]);
  });

  it('keeps a type newer than the catalogue, with its data, for renderers to skip (forward compatible)', () => {
    const future = line('campaign.declared', { name: 'Release 2.0', units: [1, { nested: true }] });
    expect(isKnownEventType(future.type)).toBe(false);
    expect(EventSchema.parse(future)).toEqual(future);
  });

  it('leaves data open for a known type without a data schema', () => {
    const sent = line('delivery.sent', { anything: 'goes' }, { quest: 'q_20261106_7k3m2a' });
    expect(EventSchema.parse(sent)).toEqual(sent);
  });

  it('takes a cleared notice: reason null, no best character', () => {
    const cleared = line('quest.unclaimable', { reason: null, rank: 'B', class: 'knight' });
    expect(issuesOf(cleared)).toEqual([]);
  });

  it('checks data without rewriting it: an omitted `characters` stays omitted', () => {
    const created = line('quest.created', { quest: QUEST_VIEW });
    expect(EventSchema.parse(created).data).toEqual({ quest: QUEST_VIEW });
  });

  it.each([
    ['agent.tool', {}, 'data.tool'],
    ['agent.tool', { tool: 'write', path: 'a.ts', diff: '+1' }, 'data: Unrecognized key: "diff"'],
    ['agent.tool', { tool: 'write', path: '' }, 'data.path'],
    ['agent.tool.blocked', { tool: 'write', reason: '' }, 'data.reason'],
    ['agent.tool', { tool: 'read', agent_type: '' }, 'data.agent_type'],
    ['agent.tool.blocked', { tool: 'read', reason: 'no', agent_type: '' }, 'data.agent_type'],
    ['agent.subagent.end', { agent_type: 'apprentice', duration_ms: 1, stopped: 'budget' }, 'data.stopped'],
    ['agent.session.start', { session: 's', model: 'Claude Opus' }, 'data.model'],
    ['agent.session.end', { outcome: 'crashed' }, 'data.outcome'],
    ['agent.session.end', { outcome: 'error', usage: { turns: 3 } }, 'data.usage.tokens'],
    ['agent.subagent.end', { agent_type: 'apprentice', duration_ms: -1 }, 'data.duration_ms'],
    ['agent.subagent.overrun', { agent_type: 'a', duration_ms: 1, limit_minutes: 0 }, 'data.limit_minutes'],
    ['mana.signal', { error: 'Rate-Limit', source: 'api_retry' }, 'data.error'],
    ['mana.level', { ...VALID_DATA['mana.level'], used_pct: 101 }, 'data.used_pct'],
    ['mana.level', { ...VALID_DATA['mana.level'], resets_at: 'tomorrow' }, 'data.resets_at'],
    ['command.applied', { command_id: 'not-a-ulid' }, 'data.command_id'],
    ['command.rejected', { reason: 'stale' }, 'data.command_id'],
    ['plot.patched', { file: 'elvaria.patch', paths: [] }, 'data.paths'],
    ['quest.infirmary', { ...QUEST_CHANGE, reason: '' }, 'data.reason'],
    ['quest.infirmary', { reason: 'breaker:time' }, 'data.quest'],
    ['quest.claimed', {}, 'data.quest'],
    ['quest.claimed', { quest: { ...QUEST_VIEW, assignee: undefined } }, 'data.quest.assignee'],
    ['quest.claimed', { quest: { ...QUEST_VIEW, plot: { type: 'none' } } }, 'Unrecognized key: "plot"'],
    ['quest.done', { quest: { ...QUEST_VIEW, status: 'finished' } }, 'data.quest.status'],
    ['quest.started', { ...QUEST_CHANGE, characters: [{ ...CHARACTER_VIEW, level: 11 }] }, 'level'],
    ['character.sleep', { character: { ...CHARACTER_VIEW, reputation: undefined } }, 'reputation'],
    ['character.created', { character: { ...CHARACTER_VIEW, status: 'lost' } }, 'data.character.status'],
    ['territory.health', { territory: { ...TERRITORY_VIEW, health: { ci: 'blue' } } }, 'health'],
    ['mana.exhausted', { ...POOL, pool: 'Gemini Models' }, 'data.pool'],
    ['mana.restored', { pool: 'claude' }, 'data.tribe'],
    ['quest.unclaimable', { ...VALID_DATA['quest.unclaimable'], reason: 'busy' }, 'data.reason'],
    ['quest.unclaimable', { reason: null, rank: 'A' }, 'data.class'],
    ['quest.edited', {}, 'data.quest'],
  ])('rejects %s with data %j', (type, data, expected) => {
    expect(issuesOf(line(type, data)).join('\n')).toContain(expected);
  });

  it.each([
    ['a line of another version', { v: 2 }, 'v: Invalid input: expected 1'],
    ['a type that is not group.action', { type: 'agent' }, 'type: Invalid string'],
    ['a type with capitals', { type: 'Agent.Tool' }, 'type: Invalid string'],
    ['a character without id', { actor: { kind: 'character' } }, 'actor.id: a character actor needs id'],
    ['an unknown actor kind', { actor: { kind: 'cron' } }, 'actor.kind: Invalid option'],
    ['an attempt 0', { attempt: 0 }, 'attempt: Too small'],
    ['a quest id of another shape', { quest: 'q_2026_abc' }, 'quest: Invalid string'],
    ['an empty session', { session: '' }, 'session: Too small'],
    ['a field outside the contract', { provider: 'claude' }, 'Unrecognized key: "provider"'],
    ['a line without data', { data: undefined }, 'data: Invalid input'],
  ])('rejects %s', (_, change, expected) => {
    expect(issuesOf(line('delivery.sent', {}, change)).join('\n')).toContain(expected);
  });

  it('reports data issues under data with the code zod gave them', () => {
    const result = EventSchema.safeParse(
      line('agent.session.end', { outcome: 'error', usage: { turns: 3 } }),
    );
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ code: 'invalid_type', path: ['data', 'usage', 'tokens'] }),
    ]);
  });
});

describe('event narrowing', () => {
  const [toolLine, manaLine] = examples.map((example) => EventSchema.parse(example));

  it('narrows data by type through isTypedEvent', () => {
    expect(isTypedEvent(toolLine!)).toBe(true);
    expect(isTypedEvent(EventSchema.parse(line('delivery.sent', {})))).toBe(false);
    const event = toolLine!;
    if (!isTypedEvent(event)) throw new Error('expected a typed event');
    switch (event.type) {
      case 'agent.tool':
        expectTypeOf(event.data.tool).toEqualTypeOf<ToolKind>();
        expect(event.data.path).toBe('src/auth/login.ts');
        break;
      default:
        throw new Error(`unexpected ${event.type}`);
    }
  });

  it('narrows to one type through isEventOf', () => {
    expect(isEventOf(toolLine!, 'mana.level')).toBe(false);
    const event = manaLine!;
    if (!isEventOf(event, 'mana.level')) throw new Error('expected mana.level');
    expectTypeOf(event.data.used_pct).toEqualTypeOf<number>();
    expect(event.data.used_pct).toBe(42);
  });
});

describe('event contract', () => {
  const contract = contractOf('event', EventSchema);

  it('states one data rule per data schema, shared types in one enum', () => {
    const rules = contract.allOf as { if: { properties: { type: unknown } } }[];
    expect(rules.map((rule) => rule.if.properties.type)).toContainEqual({
      enum: ['command.applied', 'command.rejected'],
    });
    expect(rules).toHaveLength(new Set(Object.values(EVENT_DATA_SCHEMAS)).size);
  });

  it('carries the type catalogue without restricting type', () => {
    const defs = contract.$defs as Record<string, { enum?: unknown }>;
    expect(Object.keys(defs)).toEqual(['known_types']);
    expect(defs.known_types?.enum).toEqual([...EVENT_TYPES]);
    expect(isKnownEventType('character.level_up')).toBe(true);
  });

  it('inlines every data schema, so no rule points at a $defs entry that is not there', () => {
    expect(JSON.stringify(contract)).not.toContain('$ref');
  });
});
