// The book of waits between ticks (LL-03): a wait gets its line once it lasted 2 minutes, never before; its end
// carries the minutes since it was first seen; a restart rebuilds the waits with a line from the log.
import { describe, expect, it } from 'vitest';

import { evidenceOf, linesOf, QUEST, stamp, TERRITORY } from '../disruption/__fixtures__/lines.ts';
import { openWaitsOf, waitStepOf } from './wait-book.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId, TerritoryId, Ulid } from '../core/ids.ts';
import type { OpenWait, WaitBook } from './wait-book.ts';
import type { Wait } from './wait.ts';

/** Seconds after the fixture's 09:00. */
const t = (seconds: number): Instant => Date.parse(stamp(seconds)) as Instant;
const SCOPE: Wait = {
  reason: 'scope_held',
  territory: TERRITORY as TerritoryId,
  quest: QUEST as QuestId,
  holder: { quest: 'q_20261120_ghjkmn' as QuestId },
};
const GUEST: Wait = { reason: 'base_red', territory: TERRITORY as TerritoryId, pr: 7, holder: {} };
const EMPTY: WaitBook = { seen: [], open: [] };
const STARTED = '01JD0000000000000000000000' as Ulid;
const open = (wait: Wait, since: number): OpenWait => ({ wait, since: t(since), started: STARTED });

describe('waitStepOf', () => {
  it('writes nothing for a wait under 2 minutes, and starts it once it lasted 2, from when it was seen', () => {
    const first = waitStepOf(EMPTY, [SCOPE], t(0));
    expect(first).toEqual({ start: [], end: [], seen: [{ wait: SCOPE, since: t(0) }] });
    const under = waitStepOf({ seen: first.seen, open: [] }, [SCOPE], t(119));
    expect(under).toEqual({ start: [], end: [], seen: [{ wait: SCOPE, since: t(0) }] });
    const due = waitStepOf({ seen: under.seen, open: [] }, [SCOPE], t(120));
    expect(due).toEqual({ start: [{ wait: SCOPE, since: t(0) }], end: [], seen: [] });
  });

  it('forgets a wait gone before 2 minutes without a line', () => {
    expect(waitStepOf({ seen: [{ wait: SCOPE, since: t(0) }], open: [] }, [], t(90))).toEqual({
      start: [],
      end: [],
      seen: [],
    });
  });

  it('ends a wait with a line once it is gone, with the whole minutes since it was seen', () => {
    const book = { seen: [], open: [open(SCOPE, 0), open(GUEST, 60)] };
    expect(waitStepOf(book, [GUEST], t(47 * 60 + 59))).toEqual({
      start: [],
      end: [{ open: open(SCOPE, 0), minutes: 47 }],
      seen: [],
    });
  });

  it('keeps one wait per work and reason while its holder changes, and counts another reason anew', () => {
    const moved = { ...SCOPE, holder: { quest: 'q_20261120_zzzzzz' as QuestId } };
    expect(waitStepOf({ seen: [], open: [open(SCOPE, 0)] }, [moved], t(600))).toEqual({
      start: [],
      end: [],
      seen: [],
    });
    const mana: Wait = { ...SCOPE, reason: 'mana', holder: {} };
    expect(waitStepOf({ seen: [], open: [open(SCOPE, 0)] }, [mana], t(600))).toEqual({
      start: [],
      end: [{ open: open(SCOPE, 0), minutes: 10 }],
      seen: [{ wait: mana, since: t(600) }],
    });
  });

  it('ends at the given time a wait gone when a Steward starts, and never with minutes below 0', () => {
    const book = { seen: [], open: [open(SCOPE, 600)] };
    expect(waitStepOf(book, [], t(7200), t(3600)).end).toEqual([{ open: open(SCOPE, 600), minutes: 50 }]);
    expect(waitStepOf(book, [], t(7200), t(0)).end).toEqual([{ open: open(SCOPE, 600), minutes: 0 }]);
  });
});

describe('openWaitsOf', () => {
  it('rebuilds the waits a line started and none ended, the quest’s and the guest’s', () => {
    const events = linesOf([
      {
        type: 'wait.started',
        at: 120,
        quest: QUEST,
        territory: TERRITORY,
        data: { reason: 'scope_held', since: stamp(0), holder: SCOPE.holder },
      },
      {
        type: 'wait.started',
        at: 180,
        territory: TERRITORY,
        data: { reason: 'base_red', since: stamp(60), pr: 7, holder: {} },
      },
      {
        type: 'wait.started',
        at: 240,
        territory: TERRITORY,
        data: { reason: 'room_full', since: stamp(120), pr: 8, holder: {} },
      },
      {
        type: 'wait.ended',
        at: 300,
        territory: TERRITORY,
        data: { started: evidenceOf(2), reason: 'room_full', minutes: 3, pr: 8 },
      },
      // A line without its territory names no work: it is skipped.
      { type: 'wait.started', at: 360, data: { reason: 'room_full', since: stamp(240), pr: 9, holder: {} } },
    ]);
    expect(openWaitsOf(events)).toEqual([
      { wait: SCOPE, since: t(0), started: events[0]?.id },
      { wait: GUEST, since: t(60), started: events[1]?.id },
    ]);
  });
});
