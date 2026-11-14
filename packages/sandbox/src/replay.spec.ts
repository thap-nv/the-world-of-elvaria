import { EVENT_VERSION, EventSchema } from '@elvaria/domain';
import type { Event } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { replay, replaySchedule, replaySpan } from './replay.ts';

const line = (ts: string, index: number): Event =>
  EventSchema.parse({
    v: EVENT_VERSION,
    id: `01JCF8X4Z6Q3W9N2M5R7T8V0Y${'ABCDEFGH'.charAt(index)}`,
    ts,
    type: 'agent.notification',
    actor: { kind: 'steward' },
    data: {},
  });

const DAY = ['09:00:00', '09:00:01', '09:10:01', '09:10:01'].map((time, index) =>
  line(`2026-11-06T${time}+07:00`, index),
);

describe('replaySchedule', () => {
  it('waits the gap to the line before, `speed` times shorter; the first line comes at once', () => {
    expect(replaySchedule(DAY, 20).map(({ waitMs }) => waitMs)).toEqual([0, 50, 30_000, 0]);
    expect(replaySchedule(DAY, 1).map(({ waitMs }) => waitMs)).toEqual([0, 1000, 600_000, 0]);
  });

  it('never waits a negative time when lines are out of order', () => {
    expect(replaySchedule([DAY[2]!, DAY[0]!], 1).map(({ waitMs }) => waitMs)).toEqual([0, 0]);
  });
});

describe('replaySpan', () => {
  it('runs from the first line to the last and says how long the replay takes', () => {
    expect(replaySpan(DAY, 20)).toEqual({ from: DAY[0]!.ts, to: DAY[3]!.ts, waitMs: 30_050 });
    expect(replaySpan([], 20)).toBeUndefined();
  });
});

describe('replay', () => {
  it('shows every line in order and sleeps only between lines that are apart', async () => {
    const slept: number[] = [];
    const shown: string[] = [];
    await replay(DAY, {
      speed: 20,
      sleep: (ms) => {
        slept.push(ms);
        return Promise.resolve();
      },
      emit: (event) => {
        shown.push(event.ts.slice(11, 19));
      },
    });
    expect(slept).toEqual([50, 30_000]);
    expect(shown).toEqual(['09:00:00', '09:00:01', '09:10:01', '09:10:01']);
  });
});
