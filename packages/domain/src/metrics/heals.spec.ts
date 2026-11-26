import { describe, expect, it } from 'vitest';

import { healsOf } from './heals.ts';
import { metricsOf } from './metrics-of.ts';
import { appliedLine, at, commandOf, lineOf, questOf, verdictOf } from './__fixtures__/ledger.ts';
import type { MetricsInput } from './ledger.ts';
import type { CharacterId, TribeId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';

const THORN = 'thorn' as CharacterId;
const MIRA = 'mira' as CharacterId;
const quest = (id: number, healer: CharacterId, outcome: 'submitted' | 'breaker'): Quest => {
  const base = questOf(id, [
    { n: 1, start: 0, end: 1 },
    { n: 1, character: healer, start: 2, end: 3, outcome, tokens: id === 2 ? 100 : 300 },
  ]);
  return {
    ...base,
    assignee: THORN,
    attempt_log: base.attempt_log.map((entry, i) => ({ ...entry, heal: i === 0 ? 'due' : 'session' })),
  };
};
const quests = [
  quest(1, THORN, 'submitted'),
  quest(2, MIRA, 'submitted'),
  quest(3, MIRA, 'breaker'),
  questOf(4, [{ n: 1, start: 0 }]),
];
const submit = commandOf('submit', { quest: quests[2]?.id }, at(6));
const refusal = lineOf(
  'quest.infirmary',
  {
    reason: { code: 'breaker:commit_errors', params: {} },
    quest: { attempts: 1 },
  },
  at(4),
  quests[2]?.id,
);
const input: MetricsInput = {
  quests,
  characters: [
    { id: THORN, tribe: 'claude' as TribeId },
    { id: MIRA, tribe: 'codex' as TribeId },
  ],
  verdicts: [
    verdictOf(1, 1, 'pass', { minute: 5 }),
    verdictOf(2, 1, 'fail', { minute: 5 }),
    verdictOf(3, 1, 'partial', { minute: 5 }),
    verdictOf(4, 1, 'pass', { minute: 5 }),
  ],
  events: [refusal, appliedLine(submit)],
  commands: [submit],
};

describe('healing ledger (HL-06a)', () => {
  it('counts separate runs of one quest and attributes a heal to its last session', () => {
    const base = quest(1, THORN, 'submitted');
    const healer = quest(2, MIRA, 'breaker');
    const combined = {
      ...base,
      attempt_log: [
        ...base.attempt_log,
        { ...healer.attempt_log[1]!, tokens: 100 },
        ...healer.attempt_log.map((entry) => ({ ...entry, n: 2 })),
      ],
    };
    expect(healsOf({ ...input, quests: [combined] }).by_healer).toEqual([
      { kind: 'healer', tribe: 'codex', heals: 2, healed: 1, rate: 0.5, median_tokens: 100 },
    ]);
  });
  it('counts characters, healer kinds, outcomes, token medians, verdicts and owner submits', () => {
    expect(metricsOf(input).heals).toEqual({
      total: 3,
      by_assignee: [{ character: 'thorn', tribe: 'claude', heals: 3 }],
      by_healer: [
        { kind: 'healer', tribe: 'codex', heals: 2, healed: 1, rate: 0.5, median_tokens: 200 },
        { kind: 'self', tribe: 'claude', heals: 1, healed: 1, rate: 1, median_tokens: 300 },
      ],
      verdicts: {
        healed: { decided: 2, passed: 1, rate: 0.5 },
        ordinary: { decided: 1, passed: 1, rate: 1 },
      },
      owner_submits: 1,
    });
  });

  it('dates a heal by due, keeps later sessions, deduplicates runs and ignores orphan sessions', () => {
    const base = quest(1, THORN, 'submitted');
    const log = base.attempt_log.map((entry) =>
      entry.heal === 'session' ? { ...entry, started_at: at(0, '2026-11-09') } : entry,
    );
    const reading = { ...input, quests: [{ ...base, attempt_log: [...log, ...log] }] };
    expect(healsOf(reading, { until: '2026-11-08' }).total).toBe(1);
    expect(healsOf(reading, { since: '2026-11-09' }).total).toBe(0);
    expect(
      healsOf({
        ...input,
        quests: [{ ...base, attempt_log: log.filter((entry) => entry.heal === 'session') }],
      }).total,
    ).toBe(0);
  });

  it('shows pending, unknown tribes, missing tokens and no decided verdicts', () => {
    const base = quest(1, THORN, 'submitted');
    const pending = { ...base, attempt_log: base.attempt_log.slice(0, 1) };
    expect(healsOf({ quests: [pending], events: [], commands: [], verdicts: [] })).toEqual({
      total: 1,
      by_assignee: [{ character: 'thorn', tribe: null, heals: 1 }],
      by_healer: [{ kind: 'pending', tribe: null, heals: 1, healed: 0, rate: 0, median_tokens: null }],
      verdicts: {
        healed: { decided: 0, passed: 0, rate: null },
        ordinary: { decided: 0, passed: 0, rate: null },
      },
      owner_submits: 0,
    });
    expect(healsOf({ quests: [], events: [], commands: [], verdicts: [] }).by_healer).toEqual([]);
  });

  it('requires an applied owner submit after a healable refusal in the same run and window', () => {
    expect(healsOf({ ...input, events: [appliedLine(submit), refusal] }).owner_submits).toBe(0);
    expect(healsOf({ ...input, events: [refusal] }).owner_submits).toBe(0);
    expect(
      healsOf({ ...input, events: [refusal, { ...appliedLine(submit), attempt: 2 }] }).owner_submits,
    ).toBe(0);
    expect(healsOf(input, { until: '2026-11-07' }).owner_submits).toBe(0);
    expect(healsOf({ ...input, commands: [] }).owner_submits).toBe(0);
  });

  it('handles missing character facts and tokens, null characters, and multiple assignees', () => {
    const base = quest(1, MIRA, 'submitted');
    const unknown = {
      ...base,
      attempt_log: base.attempt_log.map((entry) => {
        const { tokens: _tokens, ...rest } = entry;
        return rest;
      }),
    };
    const machine = {
      ...quest(2, THORN, 'submitted'),
      attempt_log: base.attempt_log.map((entry) => ({ ...entry, character: null })),
    };
    const other = {
      ...quest(3, MIRA, 'submitted'),
      attempt_log: base.attempt_log.map((entry) => ({ ...entry, character: MIRA })),
    };
    const reading = healsOf({ quests: [unknown, machine, other], events: [], commands: [], verdicts: [] });
    expect(reading.by_assignee).toEqual([
      { character: null, tribe: null, heals: 1 },
      { character: 'mira', tribe: null, heals: 1 },
      { character: 'thorn', tribe: null, heals: 1 },
    ]);
    expect(reading.by_healer[0]?.median_tokens).toBe(300);
    expect(
      healsOf({ quests: [unknown], events: [], commands: [], verdicts: [] }).by_healer[0]?.median_tokens,
    ).toBeNull();
  });

  it('uses event attempt numbers and excludes unknown quests, other reasons and non-owner commands', () => {
    const chancellor = { ...submit, source: 'chancellor' as const };
    const absent = commandOf('submit', { quest: questOf(99, []).id }, at(6));
    const noLog = { ...quests[2]!, attempt_log: [] };
    expect(healsOf({ ...input, quests: [noLog], events: [refusal, appliedLine(submit)] }).owner_submits).toBe(
      1,
    );
    expect(
      healsOf({
        ...input,
        events: [
          { ...refusal, attempt: 1 },
          { ...appliedLine(submit), attempt: 1 },
        ],
      }).owner_submits,
    ).toBe(1);
    expect(healsOf({ ...input, commands: [chancellor] }).owner_submits).toBe(0);
    expect(
      healsOf({ ...input, commands: [absent], events: [refusal, appliedLine(absent)] }).owner_submits,
    ).toBe(0);
    expect(
      healsOf({
        ...input,
        events: [
          lineOf('quest.infirmary', { reason: { code: 'breaker:setup' } }, at(4), quests[2]?.id),
          appliedLine(submit),
        ],
      }).owner_submits,
    ).toBe(0);
  });
});
