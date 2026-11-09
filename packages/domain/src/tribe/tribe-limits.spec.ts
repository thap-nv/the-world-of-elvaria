import { describe, expect, it } from 'vitest';

import { ADAPTER_CAPABILITIES } from './capabilities.ts';
import { FULL_TRIBE_LIMITS, TRIBE_NARROWING, tribeLimitsOf } from './tribe-limits.ts';
import type { AdapterCapability, AdapterFlags } from './capabilities.ts';
import type { TribeLimits } from './tribe-limits.ts';

const ALL: AdapterFlags = {
  headless: true,
  context_file: true,
  events: true,
  tool_gate: true,
  usage: true,
  structured_output: true,
  resume: true,
  compact: true,
  subagent: true,
};

const without = (...missing: AdapterCapability[]): AdapterFlags => ({
  ...ALL,
  ...Object.fromEntries(missing.map((capability) => [capability, false])),
});

// §3.14 "Năng lực": what Elvaria does when an adapter lacks one capability.
const TABLE: readonly [AdapterCapability, Partial<TribeLimits>][] = [
  ['headless', { enabled: false }],
  ['context_file', { context: 'prompt' }],
  ['events', { activity: 'start_end', apprentice: false }],
  ['tool_gate', { max_rank: 'D', guarded_zones: false, handover_check: 'after_session' }],
  ['usage', { mana_source: 'elapsed_time', breakers: 'minutes_only' }],
  ['structured_output', { structured_output: 'prompt_and_parse' }],
  ['resume', { resume: false }],
  ['compact', { compact: false }],
  ['subagent', { apprentice: false }],
];

describe('tribeLimitsOf', () => {
  it('leaves a tribe whose adapter declares everything unlimited', () => {
    expect(tribeLimitsOf(ALL)).toEqual(FULL_TRIBE_LIMITS);
    expect(FULL_TRIBE_LIMITS).toMatchObject({ enabled: true, max_rank: 'S', apprentice: true });
  });

  it.each(TABLE)('narrows a tribe without %s', (capability, narrowed) => {
    expect(tribeLimitsOf(without(capability))).toEqual({ ...FULL_TRIBE_LIMITS, ...narrowed });
  });

  it('has one row per capability, in the order adapters declare them', () => {
    expect(TRIBE_NARROWING.map(({ capability }) => capability)).toEqual([...ADAPTER_CAPABILITIES]);
  });

  it('applies every missing capability at once', () => {
    const limits = tribeLimitsOf(without('tool_gate', 'usage', 'structured_output'));
    expect(limits).toMatchObject({
      max_rank: 'D',
      guarded_zones: false,
      mana_source: 'elapsed_time',
      breakers: 'minutes_only',
      structured_output: 'prompt_and_parse',
      apprentice: true,
    });
  });

  it('takes the apprentice away when either events or a bounded subagent is missing', () => {
    expect(tribeLimitsOf(without('events')).apprentice).toBe(false);
    expect(tribeLimitsOf(without('subagent')).apprentice).toBe(false);
    expect(tribeLimitsOf(without('subagent')).activity).toBe('full');
  });

  it('narrows a tribe with nothing but a headless mode to the floor', () => {
    const bare = Object.fromEntries(
      ADAPTER_CAPABILITIES.map((capability) => [capability, capability === 'headless']),
    ) as Record<AdapterCapability, boolean>;
    expect(tribeLimitsOf(bare)).toEqual({
      enabled: true,
      max_rank: 'D',
      guarded_zones: false,
      handover_check: 'after_session',
      context: 'prompt',
      activity: 'start_end',
      apprentice: false,
      mana_source: 'elapsed_time',
      breakers: 'minutes_only',
      structured_output: 'prompt_and_parse',
      resume: false,
      compact: false,
    });
  });
});
