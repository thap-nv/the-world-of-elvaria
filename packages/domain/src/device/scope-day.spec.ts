// The property of W6 on the fake day of P0-09: a limited device that reduces the lines scopeEvents gives it, and takes
// the snapshot it is sent when `resync` says so, holds at every line what scopeState makes of the whole state; it never
// receives a line of a territory it was not given; and it is sent a snapshot only when the lines alone fall short.
import { describe, expect, it } from 'vitest';

import { DC1, ELVARIA, fakeDay } from '../world/__fixtures__/fake-day.ts';
import { applyEvent, reduce } from '../world/reduce.ts';
import { worldStateOf } from '../world/world-state.ts';
import { scopeEvents } from './scope-events.ts';
import { scopeState } from './scope-state.ts';
import type { Event } from '../schema/event/event.ts';
import type { WorldState } from '../world/world-state.ts';
import type { Territories } from './scope-state.ts';

const DAY = fakeDay();
const MORNING = worldStateOf(DAY.morning);
const SCOPES: readonly (readonly [string, Territories])[] = [
  ['dc1 only', [DC1.id]],
  ['elvaria only', [ELVARIA.id]],
  ['both', [DC1.id, ELVARIA.id]],
];

interface Run {
  readonly kept: readonly Event[];
  readonly resyncs: number;
}

/** The Herald, one line at a time: the device's state must be the scoped whole after every line. */
function followDay(territories: Territories): Run {
  let whole: WorldState = MORNING;
  let device = scopeState(MORNING, territories);
  const kept: Event[] = [];
  let resyncs = 0;
  for (const line of DAY.events) {
    const scoped = scopeEvents([line], whole, territories);
    whole = applyEvent(whole, line);
    const reduced = reduce(device, scoped.events);
    const expected = scopeState(whole, territories);
    // Without a resync the lines alone are enough; with one, they were not (no snapshot is sent for nothing).
    if (scoped.resync) {
      expect(reduced).not.toEqual(expected);
      resyncs += 1;
    } else expect(reduced).toEqual(expected);
    device = scoped.resync ? expected : reduced;
    kept.push(...scoped.events);
  }
  return { kept, resyncs };
}

describe('scopeState and scopeEvents on a fake day', () => {
  it.each(SCOPES)('keep a device given %s in step with the scoped whole at every line', (_, territories) => {
    followDay(territories);
  });

  it.each(SCOPES)('never send a device given %s a line of another territory', (_, territories) => {
    const { kept } = followDay(territories);
    for (const line of kept) {
      const data = line.data as { quest?: { territory?: string }; characters?: { current: unknown }[] };
      if (line.territory !== undefined) expect(territories).toContain(line.territory);
      if (data.quest?.territory !== undefined) expect(territories).toContain(data.quest.territory);
    }
    expect(kept.length).toBeGreaterThan(0);
  });

  it('send a device given every territory each line but those of no place, with no resync', () => {
    const { kept, resyncs } = followDay([DC1.id, ELVARIA.id]);
    expect(resyncs).toBe(0);
    const left = DAY.events.filter((line) => !kept.includes(line));
    // The answer to a command on no quest goes to the device that sent it (P2-01c), and a type no build knows nowhere.
    expect(left.map(({ type, quest, territory }) => [type, quest, territory])).toEqual([
      ['command.applied', undefined, undefined],
      ['campaign.declared', undefined, undefined],
    ]);
  });

  it('give over a whole day in one batch what the lines give one by one', () => {
    for (const [, territories] of SCOPES) {
      const scoped = scopeEvents(DAY.events, MORNING, territories);
      const evening = scopeState(reduce(MORNING, DAY.events), territories);
      if (!scoped.resync) expect(reduce(scopeState(MORNING, territories), scoped.events)).toEqual(evening);
      expect(scoped.events).toEqual(followDay(territories).kept);
    }
  });

  it('resync a device given one territory when work elsewhere moves the characters it sees', () => {
    expect(followDay([DC1.id]).resyncs).toBeGreaterThan(0);
    expect(followDay([ELVARIA.id]).resyncs).toBeGreaterThan(0);
  });
});
