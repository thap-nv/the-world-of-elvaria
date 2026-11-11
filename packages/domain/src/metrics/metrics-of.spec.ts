import { describe, expect, it } from 'vitest';

import { DAY } from './__fixtures__/day.ts';
import { at, questId } from './__fixtures__/ledger.ts';
import { metricsOf } from './metrics-of.ts';
import { dayOf, inWindow } from './window.ts';

const ON_THE_DAY = { since: '2026-11-08', until: '2026-11-08' } as const;

describe('metricsOf over one day', () => {
  const metrics = metricsOf(DAY, ON_THE_DAY);

  it('counts the entries of the day: sessions, the machine, the pauses and the sequels', () => {
    expect(metrics.window).toEqual(ON_THE_DAY);
    expect(metrics.runs).toEqual({ entries: 31, sessions: 30, machine: 1, paused: 1, sequels: 2 });
  });

  it('counts the rework of the day by cause, the review that ended the next day left out', () => {
    expect(metrics.rework).toHaveLength(13);
    const count = (cause: string) => metrics.rework.filter((entry) => entry.cause === cause).length;
    expect([count('infra'), count('output'), count('question'), count('unknown')]).toEqual([3, 8, 2, 0]);
  });

  it('rates the first runs decided, by class, tag, model and kind', () => {
    const { overall, by_class, by_tag, by_model, by_kind } = metrics.first_pass;
    expect(overall).toEqual({ key: null, decided: 8, passed: 3 });
    expect(by_model).toEqual([
      { key: null, decided: 2, passed: 1 },
      { key: 'claude-opus-5-5', decided: 1, passed: 1 },
      { key: 'claude-sonnet-5-5', decided: 4, passed: 1 },
      { key: 'gemini-4-argon-medium', decided: 1, passed: 0 },
    ]);
    expect(by_class).toContainEqual({ key: 'knight', decided: 4, passed: 2 });
    expect(by_tag).toContainEqual({ key: 'frontend', decided: 2, passed: 1 });
    expect(by_kind).toContainEqual({ key: 'build', decided: 3, passed: 1 });
  });

  it("finds the owner's return of a passed run, and the cost of the quest sealed", () => {
    expect(metrics.escaped).toEqual([
      expect.objectContaining({ quest: questId(8), n: 1, fail_kind: 'style' }),
    ]);
    expect(metrics.sealed).toEqual([
      { quest: questId(1), sealed_at: at(30), tokens: 410, span_minutes: 18, session_minutes: 16 },
    ]);
  });

  it("counts the owner's applied commands on quests by kind, seals and unapplied ones aside", () => {
    expect(Object.fromEntries(metrics.owner_commands.map(({ kind, count }) => [kind, count]))).toEqual({
      return: 1,
      retry: 1,
      reassign: 0,
      edit_quest: 0,
      set_rank: 0,
      answer: 2,
      cancel: 1,
    });
  });

  it('has a row per quest worked or stepped into, by id', () => {
    expect(metrics.quests.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(questId));
    expect(metrics.quests[3]).toEqual({
      id: questId(4),
      kind: 'publish',
      tier: 'session',
      class: 'bard',
      status: 'archived',
      entries: 5,
      tokens: 0,
      rework: { infra: 0, output: 2, question: 1, unknown: 0 },
      first_pass: false,
      owner_commands: 1,
    });
    expect(metrics.quests[0]).toMatchObject({ tokens: 410, first_pass: false });
    expect(metrics.quests[5]).toMatchObject({ tier: 'script', class: null, first_pass: null });
    expect(metrics.quests[9]).toMatchObject({ entries: 0, owner_commands: 1, first_pass: null });
  });
});

describe('metricsOf over other windows', () => {
  it('counts on the next day the rework of a review begun the day before, not its first run', () => {
    const metrics = metricsOf(DAY, { since: '2026-11-09' });
    expect(metrics.rework).toEqual([
      expect.objectContaining({ quest: questId(9), cause: 'infra', value: 'breaker' }),
    ]);
    expect(metrics.runs).toEqual({ entries: 1, sessions: 1, machine: 0, paused: 0, sequels: 1 });
    expect(metrics.first_pass.overall).toEqual({ key: null, decided: 0, passed: 0 });
    expect(metrics.quests).toEqual([
      expect.objectContaining({ id: questId(9), first_pass: null, owner_commands: 1 }),
    ]);
  });

  it('rates a quest whose file names no class under none', () => {
    const [, judged] = DAY.quests;
    if (judged === undefined) throw new Error('the day has a second quest');
    const { class_required: _class, ...classless } = judged;
    const metrics = metricsOf({ ...DAY, quests: [classless] }, ON_THE_DAY);
    expect(metrics.first_pass.by_class).toEqual([{ key: null, decided: 1, passed: 1 }]);
  });

  it('reads the whole kingdom without a window', () => {
    const metrics = metricsOf(DAY);
    expect(metrics.window).toEqual({});
    expect(metrics.rework).toHaveLength(14);
    expect(metrics.runs.sequels).toBe(3);
  });
});

describe('window', () => {
  it('takes the day a timestamp is written in, both ends inclusive', () => {
    expect(dayOf('2026-11-08T23:59:00+07:00')).toBe('2026-11-08');
    expect(inWindow({ until: '2026-11-08' }, '2026-11-08T23:59:00+07:00')).toBe(true);
    expect(inWindow({ until: '2026-11-07' }, '2026-11-08T00:00:00+07:00')).toBe(false);
    expect(inWindow({ since: '2026-11-09' }, '2026-11-08T23:59:00+07:00')).toBe(false);
  });
});
