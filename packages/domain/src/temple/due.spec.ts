import { describe, expect, it } from 'vitest';

import { at, lineOf, questId } from '../metrics/__fixtures__/ledger.ts';
import { templeDue, templeLogOf } from './due.ts';
import type { Event } from '../schema/event/event.ts';
import type { TempleLog, TempleSchedule } from './due.ts';

const ON: TempleSchedule = { enabled: true, every_quests: 3, weekly: true };
const DAY = '2026-11-19';

const verdict = (quest: number, result: 'pass' | 'fail', suffix = ''): Event =>
  lineOf(`verdict.${result}`, { verdict: `${questId(quest)}-1${suffix}` }, at(quest), questId(quest));
const ran = (day: string): Event =>
  lineOf(
    'temple.ran',
    { trigger: 'quests', day, groups: 1, operations: 0, letters: 0, tokens: 0 },
    at(0, day),
  );
const character = (
  type: string,
  id: string,
  status: string,
  actor: Event['actor'] = { kind: 'steward' },
): Event => ({
  ...lineOf(type, { character: { id, status } }, at(0)),
  actor,
});

const log = (over: Partial<TempleLog> = {}): TempleLog => ({
  last_day: '2026-11-18',
  judged: 0,
  fails: 0,
  suspended: [],
  ...over,
});

describe('templeLogOf (PS-12d)', () => {
  it('counts the runs judged since the last temple.ran, a run the owner also judged once', () => {
    const events = [
      verdict(1, 'fail'),
      ran('2026-11-18'),
      verdict(2, 'pass'),
      verdict(3, 'fail'),
      verdict(3, 'fail', '-user'),
    ];
    expect(templeLogOf(events)).toEqual({ last_day: '2026-11-18', judged: 2, fails: 1, suspended: [] });
  });

  it('reads no day from a line without one, and no run from a verdict line without an id', () => {
    const broken = lineOf('temple.ran', {}, at(0));
    expect(
      templeLogOf([
        broken,
        lineOf('verdict.fail', {}, at(1)),
        lineOf('verdict.partial', { verdict: 'x' }, at(2)),
      ]),
    ).toEqual({
      last_day: null,
      judged: 0,
      fails: 0,
      suspended: [],
    });
  });

  it("keeps the Steward's fail-streak suspensions still in force, not the owner's", () => {
    const events = [
      character('character.suspend', 'thorn', 'suspended'),
      character('character.suspend', 'vesper', 'suspended'),
      character('character.suspend', 'mira', 'suspended', { kind: 'user' }),
      character('character.release', 'vesper', 'idle', { kind: 'user' }),
      character('character.level_up', 'thorn', 'suspended'),
    ];
    expect(templeLogOf(events).suspended).toEqual(['thorn']);
  });

  it('forgets a suspension a run of the Temple has seen, so one suspension makes one run', () => {
    const events = [character('character.suspend', 'thorn', 'suspended'), ran(DAY)];
    expect(templeLogOf(events).suspended).toEqual([]);
  });
});

describe('templeDue (PS-12d, DB9)', () => {
  it('is never due when off, whatever waits', () => {
    const off = { ...ON, enabled: false };
    expect(templeDue(off, log({ judged: 99, fails: 9, suspended: ['thorn' as never] }), DAY)).toEqual({
      due: false,
      why: 'disabled',
    });
  });

  it('is due once every_quests runs were judged since the last run', () => {
    expect(templeDue(ON, log({ judged: 3 }), DAY)).toEqual({ due: true, trigger: 'quests' });
    expect(templeDue(ON, log({ judged: 2 }), DAY)).toEqual({ due: false, why: 'waiting' });
    expect(templeDue(ON, log({ last_day: null, judged: 3 }), DAY)).toEqual({ due: true, trigger: 'quests' });
  });

  it('is due weekly once a week passed with a new fail, and not without one or with weekly off', () => {
    const weekAgo = log({ last_day: '2026-11-12', judged: 1, fails: 1 });
    expect(templeDue(ON, weekAgo, DAY)).toEqual({ due: true, trigger: 'weekly' });
    expect(templeDue(ON, { ...weekAgo, fails: 0 }, DAY)).toEqual({ due: false, why: 'waiting' });
    expect(templeDue({ ...ON, weekly: false }, weekAgo, DAY)).toEqual({ due: false, why: 'waiting' });
    expect(templeDue(ON, { ...weekAgo, last_day: '2026-11-13' }, DAY)).toEqual({
      due: false,
      why: 'waiting',
    });
    expect(templeDue(ON, log({ last_day: null, fails: 1 }), DAY)).toEqual({ due: true, trigger: 'weekly' });
  });

  it('runs the two counted triggers at most once a day, and not again on a day the clock went back to', () => {
    expect(templeDue(ON, log({ last_day: DAY, judged: 9, fails: 9 }), DAY)).toEqual({
      due: false,
      why: 'ran_today',
    });
    expect(templeDue(ON, log({ last_day: '2026-11-20', judged: 9 }), DAY)).toEqual({
      due: false,
      why: 'ran_today',
    });
  });

  it('is due for a suspension even when the Temple ran today, once: the run that sees it ends it', () => {
    const suspended = [character('character.suspend', 'thorn', 'suspended')];
    const before = templeLogOf([ran(DAY), ...suspended]);
    expect(templeDue(ON, before, DAY)).toEqual({ due: true, trigger: 'suspension' });
    const after = templeLogOf([ran(DAY), ...suspended, ran(DAY)]);
    expect(templeDue(ON, after, DAY)).toEqual({ due: false, why: 'ran_today' });
  });
});
