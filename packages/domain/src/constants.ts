// Every number and default the domain decides with, named in one place (implementation-plan §4.2).
// Values come from the v1 contracts in docs/schemas/ (implementation-plan §2.3).

/** `.elv-name` is 24ch wide: kingdom, territory and character names must fit it. */
export const NAME_MAX_LENGTH = 24;
export const TAG_NAME_MAX_LENGTH = 40;
export const TAG_DESCRIPTION_MAX_LENGTH = 200;

// Ids (implementation-plan §2.1).
/** Crockford base32 without i, l, o, u, lowercase: readable in logs and never mistaken for 1 or 0. */
export const CROCKFORD_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
export const DATED_ID_RANDOM_CHARS = 6;
export const BITS_PER_BASE32_CHAR = 5;
export const BYTE_BITS = 8;
export const ULID_TIME_CHARS = 10;
export const ULID_RANDOM_CHARS = 16;
export const ULID_RANDOM_BYTES = 10;
export const ULID_MAX_TIME_MS = 2 ** 48 - 1;

// kingdom.json defaults: `elvaria init` writes them and the owner tunes them.
export const MANA_DEFAULTS = {
  cap_pct: 98,
  king_reserve_pct: 2,
  warn_margin_pct: 10,
  probe_interval_minutes: 15,
} as const;
/** A reserve or warning margin above half the quota would leave the world unable to work. */
export const MANA_MARGIN_MAX_PCT = 50;
export const MINUTES_PER_DAY = 1440;

export const BREAKER_DEFAULTS = {
  attempt_minutes_low: 45,
  attempt_minutes_high: 120,
  high_rank_from: 'B',
  max_attempts: 3,
  mana_multiplier: 2,
  same_fail_suspend: 3,
  patrol_weekly_pct: 10,
  max_turns: 200,
  subagent_max_minutes: 5,
  subagent_max_turns: 30,
  /** One quest must fit one context (principle 13); the Chancellor splits work above this. */
  context_budget_tokens: 120_000,
} as const;

export const SCHEDULE_DEFAULTS = {
  chronicle_at: '21:00',
  temple_every_quests: 10,
  patrol_every: 'P1D',
} as const;

export const DISPATCH_DEFAULTS = { tick_seconds: 5 } as const;

// territory.json defaults.
export const TERRITORY_DEFAULTS = {
  worktree_dir: '.elvaria/worktrees',
  max_concurrent: 1,
  context_files: ['CLAUDE.md', 'README.md', '.claude/rules/*.md'],
} as const;

/**
 * Ritual steps the verifier prompt knows how to run (glossary §13). A step is code in runner-core's prompt
 * builder, not data, so a ritual naming any other step is rejected when the registry loads.
 */
export const RITUAL_STEPS = [
  'run_checks',
  'read_handover',
  'read_diff',
  'read_draft',
  'read_plan',
  'check_sources',
  'cross_check_sources',
  'check_regression_test',
  'compare_before_after',
  'score_tone_checklist',
  'rerun_from_source',
  'compare_numbers',
  'challenge_scope',
  'tally_units',
  'judge',
  'write_verdict',
] as const;
