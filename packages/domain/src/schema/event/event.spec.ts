import { describe, expect, it } from 'vitest';

import examples from '../../../examples/event.json' with { type: 'json' };
import { CHARACTER_VIEW, QUEST_VIEW, TERRITORY_VIEW } from '../../world/__fixtures__/examples.ts';
import { POOL, QUEST_CHANGE, SHA_NEW, ULID, VALID_DATA } from './__fixtures__/valid-data.ts';
import { isKnownEventType } from './event-types.ts';
import { EventSchema } from './event.ts';

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

  it.each([
    ['written before P1-32: the reason alone', { reason: 'breaker:time', ...QUEST_CHANGE }],
    ['a trip that says it all', { reason: 'max_attempts', trip: 'max_attempts', ...QUEST_CHANGE }],
    [
      'a script that failed and opened its follow-up',
      {
        reason: 'script:fail: lint-fix did not pass, see the verdict; follow-up quest …',
        trip: 'script_fail',
        detail: { script: 'lint-fix', follow_up: 'q_20261106_7k3m2b' },
        ...QUEST_CHANGE,
      },
    ],
    [
      'a review no verifier could finish',
      {
        reason: 'breaker:time: past 30 minutes; a breaker stopped 2 verifiers of run 1, …',
        trip: 'time',
        detail: { message: 'past 30 minutes', verifiers_stopped: 2 },
        ...QUEST_CHANGE,
      },
    ],
    [
      'a forbidden path a session left changed (P1-49)',
      {
        reason: 'breaker:forbidden_paths: infra/secrets/key.txt changed in the plot, …',
        trip: 'forbidden_paths',
        detail: { paths: ['infra/secrets/key.txt'] },
        ...QUEST_CHANGE,
        sequels: [{ session_id: 's-2', why: 'the handover letter is unchanged' }],
      },
    ],
  ])('accepts an infirmary line: %s', (_, data) => {
    expect(issuesOf(line('quest.infirmary', data))).toEqual([]);
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
    ['check.start', { checks: [] }, 'data: Unrecognized key: "checks"'],
    ['check.end', { outcome: 'crashed', checks: [] }, 'data.outcome'],
    ['check.end', { outcome: 'pass', checks: [{ id: 'unit', pass: true }] }, 'data.checks.0.duration_ms'],
    ['mana.signal', { error: 'Rate-Limit', source: 'api_retry' }, 'data.error'],
    ['mana.level', { ...VALID_DATA['mana.level'], used_pct: 101 }, 'data.used_pct'],
    ['mana.level', { ...VALID_DATA['mana.level'], resets_at: 'tomorrow' }, 'data.resets_at'],
    ['command.applied', { command_id: 'not-a-ulid' }, 'data.command_id'],
    ['command.rejected', { reason: 'stale' }, 'data.command_id'],
    ['plot.patched', { file: 'elvaria.patch', paths: [] }, 'data.paths'],
    ['plot.merged', { into: 'quest/q', merged: [], pending: [], stop: 'dirty' }, 'data.stop'],
    ['plot.merged', { into: '', merged: [], pending: [] }, 'data.into'],
    ['plot.restored', { paths: [] }, 'data.paths'],
    ['quest.infirmary', { ...QUEST_CHANGE, reason: '' }, 'data.reason'],
    ['quest.infirmary', { reason: 'breaker:time' }, 'data.quest'],
    ['quest.infirmary', { ...QUEST_CHANGE, reason: 'r', trip: 'crash' }, 'data.trip'],
    ['quest.infirmary', { ...QUEST_CHANGE, reason: 'r', detail: { message: '' } }, 'data.detail.message'],
    ['quest.infirmary', { ...QUEST_CHANGE, reason: 'r', detail: { hook: 'x' } }, 'Unrecognized key: "hook"'],
    [
      'quest.infirmary',
      { ...QUEST_CHANGE, reason: 'r', detail: { apprentice_left: false } },
      'apprentice_left',
    ],
    ['quest.infirmary', { ...QUEST_CHANGE, reason: 'r', detail: { script: 'Lint' } }, 'data.detail.script'],
    ['quest.infirmary', { ...QUEST_CHANGE, reason: 'r', detail: { follow_up: 'q_1' } }, 'detail.follow_up'],
    [
      'quest.infirmary',
      { ...QUEST_CHANGE, reason: 'r', detail: { verifiers_stopped: 0 } },
      'verifiers_stopped',
    ],
    ['quest.infirmary', { ...QUEST_CHANGE, reason: 'r', detail: { paths: [] } }, 'data.detail.paths'],
    ['quest.submitted', { ...QUEST_CHANGE, sequels: [] }, 'data.sequels'],
    ['quest.submitted', { ...QUEST_CHANGE, sequels: [{ session_id: '' }] }, 'data.sequels.0.session_id'],
    ['quest.verdict', { ...QUEST_CHANGE, sequels: [{ why: 'x', model: 'm' }] }, 'Unrecognized key: "model"'],
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
    ['mana.exhausted', { ...POOL, model: 'Argon' }, 'data.model'],
    ['mana.warning', { ...VALID_DATA['mana.warning'], used_pct: 120 }, 'data.used_pct'],
    ['quest.unclaimable', { ...VALID_DATA['quest.unclaimable'], reason: 'busy' }, 'data.reason'],
    ['quest.unclaimable', { reason: null, rank: 'A' }, 'data.class'],
    ['quest.edited', {}, 'data.quest'],
    ['memo.filed', { memo: 'm_1', kind: 'proposal', from: 'thorn' }, 'data.memo'],
    ['graph.built', { commit: 'abc123', duration_ms: 5 }, 'data.commit'],
    ['graph.failed', { commit: SHA_NEW, reason: '' }, 'data.reason'],
    ['memo.routed', { memo: 'm_20261106_4k2pqz', route: 'everyone' }, 'data.route'],
    ['memo.closed', { memo: 'm_20261106_4k2pqz', decision: 'done' }, 'data.decision'],
    ['memo.escalated', { memo: 'm_20261106_4k2pqz', action: 'owner', holds: [] }, 'data.holds'],
    // PS-03b: only a command the owner did not write names its source.
    ['command.applied', { command_id: ULID, source: 'cli' }, 'data.source'],
    ['schedule.ran', { job: 'patrol', day: '2026-11-06' }, 'data.job'],
    ['schedule.ran', { job: 'digest', day: '20261106' }, 'data.day'],
    ['digest.written', { day: '2026-11-06', file: 'digest/x.md', must: 0, can_wait: 0 }, 'data.file'],
    [
      'digest.written',
      { day: '2026-11-06', file: 'digest/2026-11-06.md', must: -1, can_wait: 0 },
      'data.must',
    ],
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
