// The merges without the seal per territory (PS-08b): what the owner weighs the delegation of the seal by; (PS-08g) the
// ones a signal of the breaker named, and the owner's reports of escaped defects, sealed or not.
import { describe, expect, it } from 'vitest';

import { ran } from '../patrol/__fixtures__/patrol-log.ts';
import { EventSchema } from '../schema/event/event.ts';
import { reportedEscapesOf, unsealedCountsOf } from './unsealed-counts.ts';
import type { Event } from '../schema/event/event.ts';

let serial = 0;
const lineOf = (type: string, ts: string, data: Record<string, unknown>, quest?: string): Event => {
  serial += 1;
  return EventSchema.parse({
    v: 2,
    id: `01JE${String(serial).padStart(22, '0')}`,
    ts,
    type,
    actor: { kind: 'steward' },
    ...(quest === undefined ? {} : { quest }),
    data,
  });
};

const merged = (
  territory: string,
  sealed: boolean,
  day = '2026-11-18',
  quest = `q_20261118_${String(serial).padStart(6, 'a')}`,
) =>
  lineOf(
    'delivery.merged',
    `${day}T09:00:00+07:00`,
    {
      quest,
      territory,
      branch: `quest/${quest}`,
      head: 'a'.repeat(40),
      pr: { number: serial + 1, url: `https://github.com/o/r/pull/${serial + 1}` },
      merge_sha: 'b'.repeat(40),
      method: 'merge',
      sealed,
      branch_deleted: true,
    },
    quest,
  );

const escaped = (quest: string, territory: string, delegated: boolean, note?: string, day = '2026-11-18') =>
  lineOf(
    'quest.escaped',
    `${day}T12:00:00+07:00`,
    { quest, territory, delegated, ...(note === undefined ? {} : { note }) },
    quest,
  );

describe('unsealedCountsOf', () => {
  it("counts each territory's merges by the Steward and those without the seal, by territory id", () => {
    const events = [
      merged('handbook', false),
      merged('dc1', true),
      merged('dc1', false),
      merged('dc1', false),
    ];
    expect(unsealedCountsOf(events, {})).toEqual([
      { territory: 'dc1', merged: 3, unsealed: 2, escaped: 0 },
      { territory: 'handbook', merged: 1, unsealed: 1, escaped: 0 },
    ]);
  });

  it('counts only the window, and nothing without a merge', () => {
    const events = [merged('dc1', false, '2026-11-16'), merged('dc1', true)];
    expect(unsealedCountsOf(events, { since: '2026-11-17' })).toEqual([
      { territory: 'dc1', merged: 1, unsealed: 0, escaped: 0 },
    ]);
    expect(unsealedCountsOf([], {})).toEqual([]);
  });

  it('counts the merges without the seal that a report or a red check named, each once; a sealed one never', () => {
    const events = [
      ran('2026-11-17T06:30:00+07:00', [{ id: 'unit', pass: true }]),
      merged('elvaria', false, '2026-11-18', 'q_20261118_bbbbb1'),
      merged('elvaria', false, '2026-11-18', 'q_20261118_bbbbb2'),
      merged('elvaria', true, '2026-11-18', 'q_20261118_bbbbb3'),
      merged('elvaria', false, '2026-11-18', 'q_20261118_bbbbb4'),
      // The patrol finds `unit` red: the four merges are its suspects, three without the seal.
      ran('2026-11-19T06:30:00+07:00', [{ id: 'unit', pass: false }]),
      merged('elvaria', false, '2026-11-19', 'q_20261119_ccccc1'),
      escaped('q_20261119_ccccc1', 'elvaria', true),
      escaped('q_20261118_bbbbb1', 'elvaria', true),
      escaped('q_20261118_bbbbb3', 'elvaria', false),
    ];
    expect(unsealedCountsOf(events, {})).toEqual([
      { territory: 'elvaria', merged: 5, unsealed: 4, escaped: 4 },
    ]);
    const quiet = [merged('dc1', false), escaped('q_20261118_zzzzz1', 'dc1', true)];
    expect(unsealedCountsOf(quiet, {})).toEqual([{ territory: 'dc1', merged: 1, unsealed: 1, escaped: 0 }]);
  });
});

describe('reportedEscapesOf', () => {
  it("lists the owner's reports in the window, sealed or not, with the note when there is one", () => {
    const events = [
      escaped('q_20261116_ddddd1', 'dc1', true, undefined, '2026-11-16'),
      escaped('q_20261118_ddddd2', 'dc1', true, 'the login page broke'),
      merged('dc1', true),
      escaped('q_20261118_ddddd3', 'handbook', false),
    ];
    expect(reportedEscapesOf(events, { since: '2026-11-17' })).toEqual([
      {
        quest: 'q_20261118_ddddd2',
        territory: 'dc1',
        delegated: true,
        note: 'the login page broke',
        at: '2026-11-18T12:00:00+07:00',
      },
      {
        quest: 'q_20261118_ddddd3',
        territory: 'handbook',
        delegated: false,
        at: '2026-11-18T12:00:00+07:00',
      },
    ]);
  });
});
