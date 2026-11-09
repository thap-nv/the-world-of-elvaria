// tribeLimitsOf(caps): how far one tribe may go, given what its adapter can do (implementation-plan §3.14,
// ADR 0021). The narrowing is a table, not a switch over adapters: a missing capability overrides some limits,
// and every row is applied in turn. Rules that compare several tribes ("no Chancellor on a tribe without
// structured output while another has it") are a separate pure function (P1-13, §10 question 6).
import { FULL_MAX_RANK, NO_TOOL_GATE_MAX_RANK } from './constants.ts';
import type { AdapterCapability, AdapterFlags } from './capabilities.ts';
import type { Rank } from '../schema/common.ts';

export interface TribeLimits {
  /**
   * Without `headless` the tribe cannot be enabled: the conformance suite (`elvaria tribe check`) refuses it, and
   * planTick gives it nothing even when kingdom.json was turned on by hand (P1-19; P1-33, as the owner settled P1-34 (b)).
   */
  readonly enabled: boolean;
  /** Highest quest rank the tribe takes; F–D without a tool gate. */
  readonly max_rank: Rank;
  /** May take quests touching `laws.read_before_write` or a `rank_floor` zone; needs a tool gate. */
  readonly guarded_zones: boolean;
  /** Where an unchanged handover letter is caught: the Stop hook, or a check after the session ends. */
  readonly handover_check: 'stop_hook' | 'after_session';
  /** How the gazetteer and `territory.context_files` reach the model: the CLI's context file, or the prompt. */
  readonly context: 'context_file' | 'prompt';
  /** full: tool and walk events; start_end: only `agent.session.start/end` ("working / done"). */
  readonly activity: 'full' | 'start_end';
  /** May start the apprentice (§3.12); needs the events to measure it and a bounded subagent. */
  readonly apprentice: boolean;
  /** Where mana readings come from: the CLI's usage, or elapsed time. */
  readonly mana_source: 'usage' | 'elapsed_time';
  /** Which breakers can trip: tokens and minutes, or minutes only. */
  readonly breakers: 'tokens_and_minutes' | 'minutes_only';
  /** native: `--json-schema`; prompt_and_parse: the schema in the prompt, zod parse, one retry. */
  readonly structured_output: 'native' | 'prompt_and_parse';
  /** May continue a session with `--resume`; without it every revival is a fresh session (ADR 0017). */
  readonly resume: boolean;
  /** May compact in place to meditate; without it meditation is a fresh session from the handover. */
  readonly compact: boolean;
}

/** A tribe whose adapter declares every capability. */
export const FULL_TRIBE_LIMITS: TribeLimits = {
  enabled: true,
  max_rank: FULL_MAX_RANK,
  guarded_zones: true,
  handover_check: 'stop_hook',
  context: 'context_file',
  activity: 'full',
  apprentice: true,
  mana_source: 'usage',
  breakers: 'tokens_and_minutes',
  structured_output: 'native',
  resume: true,
  compact: true,
};

export interface TribeNarrowing {
  readonly capability: AdapterCapability;
  /** The limits that change when the adapter lacks the capability. */
  readonly missing: Partial<TribeLimits>;
}

/** The table of §3.14 "Năng lực", one row per capability, in its order. */
export const TRIBE_NARROWING: readonly TribeNarrowing[] = [
  { capability: 'headless', missing: { enabled: false } },
  { capability: 'context_file', missing: { context: 'prompt' } },
  { capability: 'events', missing: { activity: 'start_end', apprentice: false } },
  {
    capability: 'tool_gate',
    missing: { max_rank: NO_TOOL_GATE_MAX_RANK, guarded_zones: false, handover_check: 'after_session' },
  },
  { capability: 'usage', missing: { mana_source: 'elapsed_time', breakers: 'minutes_only' } },
  { capability: 'structured_output', missing: { structured_output: 'prompt_and_parse' } },
  { capability: 'resume', missing: { resume: false } },
  { capability: 'compact', missing: { compact: false } },
  { capability: 'subagent', missing: { apprentice: false } },
];

/** The limits of one tribe whose adapter declares `caps`. */
export function tribeLimitsOf(caps: AdapterFlags): TribeLimits {
  return TRIBE_NARROWING.reduce<TribeLimits>(
    (limits, { capability, missing }) => (caps[capability] ? limits : { ...limits, ...missing }),
    FULL_TRIBE_LIMITS,
  );
}
