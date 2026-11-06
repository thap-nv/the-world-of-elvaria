import { describe, expect, expectTypeOf, it } from 'vitest';

import examples from '../../../examples/event.json' with { type: 'json' };
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

// One valid `data` per type that has a data schema: the table must name every one of them.
const VALID_DATA: Record<TypedEventType, Record<string, unknown>> = {
  'agent.tool': { tool: 'bash', command: 'pnpm test', exit: 0, duration_ms: 5120, url: 'https://x.dev' },
  'agent.tool.blocked': { tool: 'write', reason: 'forbidden path .env' },
  'agent.session.start': { session: 'abc-123', model: 'claude-opus-4.1' },
  'agent.session.end': { outcome: 'completed', usage: { tokens: 18_000, turns: 12 } },
  'agent.subagent.end': { agent_type: 'apprentice', duration_ms: 90_000 },
  'agent.subagent.overrun': { agent_type: 'apprentice', duration_ms: 400_000, limit_minutes: 5 },
  'mana.signal': { error: 'rate_limit', source: 'stop_failure' },
  'mana.level': { tribe: 'claude', pool: 'claude', window: 'weekly', used_pct: 0, source: 'estimate' },
  'command.applied': { command_id: ULID },
  'command.rejected': { command_id: ULID, reason: 'quest is not awaiting_seal' },
  'quest.infirmary': { reason: 'breaker:time' },
};

describe('EventSchema', () => {
  it.each(examples)('accepts the v1 example $type unchanged', (example) => {
    expect(EventSchema.parse(example)).toEqual(example);
  });

  it.each(Object.entries(VALID_DATA))('accepts valid data for %s', (type, data) => {
    expect(issuesOf(line(type, data))).toEqual([]);
  });

  it('keeps a type newer than the catalogue, with its data, for renderers to skip (forward compatible)', () => {
    const future = line('campaign.declared', { name: 'Release 2.0', units: [1, { nested: true }] });
    expect(isKnownEventType(future.type)).toBe(false);
    expect(EventSchema.parse(future)).toEqual(future);
  });

  it('leaves data open for a known type without a data schema', () => {
    const created = line('quest.created', { anything: 'goes' }, { quest: 'q_20261106_7k3m2a' });
    expect(EventSchema.parse(created)).toEqual(created);
  });

  it.each([
    ['agent.tool', {}, 'data.tool'],
    ['agent.tool', { tool: 'write', path: 'a.ts', diff: '+1' }, 'data: Unrecognized key: "diff"'],
    ['agent.tool', { tool: 'write', path: '' }, 'data.path'],
    ['agent.tool.blocked', { tool: 'write', reason: '' }, 'data.reason'],
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
    ['quest.infirmary', { reason: '' }, 'data.reason'],
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
    expect(issuesOf(line('quest.created', {}, change)).join('\n')).toContain(expected);
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
    expect(isTypedEvent(EventSchema.parse(line('quest.created', {})))).toBe(false);
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
