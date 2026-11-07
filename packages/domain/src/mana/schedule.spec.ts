import { describe, expect, it } from 'vitest';

import { nextProbeOf } from './schedule.ts';
import type { Instant } from '../core/clock.ts';

const at = (hhmm: string): Instant => Date.parse(`2026-11-07T${hhmm}:00+07:00`) as Instant;
const RESET = '2026-11-07T14:00:00+07:00';

describe('nextProbeOf', () => {
  it('probes a minute after a known reset ahead', () => {
    expect(nextProbeOf(at('09:00'), RESET, null, 15)).toEqual({ at: at('14:01'), reset: at('14:00') });
  });

  it('tries again every two minutes for ten minutes past the reset it waited for', () => {
    expect(nextProbeOf(at('14:01'), undefined, at('14:00'), 15)).toEqual({
      at: at('14:03'),
      reset: at('14:00'),
    });
    expect(nextProbeOf(at('14:09'), RESET, at('14:00'), 15)).toEqual({ at: at('14:11'), reset: at('14:00') });
    expect(nextProbeOf(at('14:10'), undefined, at('14:00'), 15)).toEqual({ at: at('14:25'), reset: null });
  });

  it('falls back to the interval without a reset, or with one it cannot read', () => {
    expect(nextProbeOf(at('09:00'), undefined, null, 15)).toEqual({ at: at('09:15'), reset: null });
    expect(nextProbeOf(at('09:00'), 'soon', null, 30)).toEqual({ at: at('09:30'), reset: null });
  });
});
