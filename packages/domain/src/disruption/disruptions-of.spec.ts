import { describe, expect, it } from 'vitest';

import { evidenceOf, linesOf, OTHER_QUEST, QUEST, stamp, TERRITORY } from './__fixtures__/lines.ts';
import { disruptionsOf } from './disruptions-of.ts';
import { DisruptionKindSchema } from '../schema/disruption/disruption-kind.ts';

const NAMES = { name_vi: 'Mẫu', name_en: 'Sample', description: 'A sample kind.' };
const kind = (fields: Record<string, unknown>) => DisruptionKindSchema.parse({ ...NAMES, ...fields });

const infirmary = kind({
  id: 'infirmary_code',
  shape: 'event',
  type: 'quest.infirmary',
  where: [{ path: 'data.reason.code', in: ['breaker:commit'] }],
  cause: 'data.reason.code',
});
const waited = kind({
  id: 'waited',
  shape: 'sequence',
  first: { type: 'delivery.enqueued' },
  then: { type: 'delivery.guest_merged' },
  same: ['data.pr'],
  after_minutes: 30,
  unless: { type: 'delivery.guest_refused' },
  cause: 'then.data.method',
});
const quick = kind({
  id: 'quick',
  shape: 'sequence',
  first: { type: 'quest.edited' },
  then: { type: 'agent.session.end' },
  same: ['quest'],
  within_seconds: 60,
  cause: 'then.data.outcome',
});

const commit = { type: 'quest.infirmary', quest: QUEST, data: { reason: { code: 'breaker:commit' } } };

describe('disruptionsOf: an event kind', () => {
  it('reports each matching line with its place, time, cause and evidence', () => {
    const events = linesOf([
      { type: 'quest.started', quest: QUEST },
      { ...commit, territory: TERRITORY },
    ]);
    expect(disruptionsOf(events, [infirmary])).toEqual([
      {
        kind: 'infirmary_code',
        territory: TERRITORY,
        quest: QUEST,
        from: stamp(60),
        to: stamp(60),
        cause: 'breaker:commit',
        evidence: [evidenceOf(1)],
      },
    ]);
  });

  it('skips a line whose value is not in the list', () => {
    const events = linesOf([{ ...commit, data: { reason: { code: 'breaker:setup' } } }]);
    expect(disruptionsOf(events, [infirmary])).toEqual([]);
  });

  it('reads only the lines of the window, by the day they are written in', () => {
    const events = linesOf([commit, { ...commit, at: 86_400 }]);
    const found = disruptionsOf(events, [infirmary], { since: '2026-11-21', until: '2026-11-21' });
    expect(found.map((disruption) => disruption.evidence)).toEqual([[evidenceOf(1)]]);
  });

  it('writes a numeric cause as a string and leaves out a cause that is no code', () => {
    const attempt = kind({ id: 'third', shape: 'event', type: 'verdict.fail', cause: 'attempt' });
    const nested = kind({ id: 'nested', shape: 'event', type: 'verdict.fail', cause: 'data.verdict' });
    const events = linesOf([{ type: 'verdict.fail', attempt: 3, data: { verdict: { id: 'x' } } }]);
    expect(disruptionsOf(events, [attempt, nested])).toEqual([
      { kind: 'third', from: stamp(0), to: stamp(0), cause: '3', evidence: [evidenceOf(0)] },
      { kind: 'nested', from: stamp(0), to: stamp(0), evidence: [evidenceOf(0)] },
    ]);
  });
});

describe('disruptionsOf: a sequence kind', () => {
  const enqueued = (at: number, pr = 7) => ({
    type: 'delivery.enqueued',
    at,
    territory: TERRITORY,
    data: { pr },
  });
  const merged = (at: number, pr = 7) => ({
    type: 'delivery.guest_merged',
    at,
    data: { pr, method: 'merge' },
  });

  it('reports a wait with its whole minutes, its cause from the later line and both events', () => {
    const events = linesOf([enqueued(0), merged(30, 8), merged(1859)]);
    expect(disruptionsOf(events, [waited])).toEqual([
      {
        kind: 'waited',
        territory: TERRITORY,
        from: stamp(0),
        to: stamp(1859),
        minutes: 30,
        cause: 'merge',
        evidence: [evidenceOf(0), evidenceOf(2)],
      },
    ]);
  });

  it('takes the place from the later line when the first has none', () => {
    const bare = { type: 'delivery.enqueued', at: 0, data: { pr: 7 } };
    const events = linesOf([bare, { ...merged(1800), territory: TERRITORY }]);
    expect(disruptionsOf(events, [waited])[0]?.territory).toBe(TERRITORY);
  });

  it('does not match a wait shorter than after_minutes', () => {
    expect(disruptionsOf(linesOf([enqueued(0), merged(1799)]), [waited])).toEqual([]);
  });

  it('does not match when an unless line of the same values comes between', () => {
    const refused = { type: 'delivery.guest_refused', at: 60, data: { pr: 7 } };
    const otherRefused = { ...refused, data: { pr: 9 } };
    expect(disruptionsOf(linesOf([enqueued(0), refused, merged(3600)]), [waited])).toEqual([]);
    expect(disruptionsOf(linesOf([enqueued(0), otherRefused, merged(3600)]), [waited])).toHaveLength(1);
  });

  it('does not open a sequence on a line that lacks a value of `same`', () => {
    const noPr = { type: 'delivery.enqueued', at: 0, data: { pr: null } };
    expect(disruptionsOf(linesOf([noPr, merged(3600)]), [waited])).toEqual([]);
  });

  it('matches within_seconds up to the bound and stops looking past it', () => {
    const edit = { type: 'quest.edited', at: 0, quest: QUEST };
    const end = (at: number, quest = QUEST) => ({
      type: 'agent.session.end',
      at,
      quest,
      data: { outcome: 'killed' },
    });
    expect(disruptionsOf(linesOf([edit, end(30, OTHER_QUEST), end(60)]), [quick])).toEqual([
      {
        kind: 'quick',
        quest: QUEST,
        from: stamp(0),
        to: stamp(60),
        cause: 'killed',
        evidence: [evidenceOf(0), evidenceOf(2)],
      },
    ]);
    expect(disruptionsOf(linesOf([edit, end(61)]), [quick])).toEqual([]);
  });

  it('opens only on a first line in the window, and reads the later line past it', () => {
    const events = linesOf([enqueued(0), merged(86_400)]);
    expect(disruptionsOf(events, [waited], { until: '2026-11-20' })).toHaveLength(1);
    expect(disruptionsOf(events, [waited], { since: '2026-11-21' })).toEqual([]);
  });

  it('closes nothing when no later line matches', () => {
    expect(disruptionsOf(linesOf([enqueued(0)]), [waited])).toEqual([]);
  });
});

describe('disruptionsOf: order', () => {
  it('lists by the log order of the first event, then by the order of the kinds', () => {
    const both = kind({ id: 'any_edit', shape: 'event', type: 'quest.edited' });
    const events = linesOf([
      { type: 'quest.edited', at: 0, quest: QUEST },
      { ...commit, at: 10 },
      { type: 'agent.session.end', at: 20, quest: QUEST, data: { outcome: 'killed' } },
    ]);
    expect(disruptionsOf(events, [infirmary, quick, both]).map((disruption) => disruption.kind)).toEqual([
      'quick',
      'any_edit',
      'infirmary_code',
    ]);
  });
});
