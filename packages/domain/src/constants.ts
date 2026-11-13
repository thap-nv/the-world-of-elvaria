// Every number and default the domain decides with, named in one place (implementation-plan §4.2).
// Values come from the v1 contracts in docs/schemas/ (implementation-plan §2.3).

/** `.elv-name` is 24ch wide: kingdom, territory and character names must fit it. */
export const NAME_MAX_LENGTH = 24;
export const TAG_NAME_MAX_LENGTH = 40;
export const TAG_DESCRIPTION_MAX_LENGTH = 200;
// Shared by quest, quest-draft and the create_quest / declare_campaign commands.
export const QUEST_TITLE_MAX_LENGTH = 120;
/** Tags rank candidates by reputation per tag (character.skill_affinity), so a quest carries only a few. */
export const QUEST_TAGS_MAX = 6;
/** The Chancellor asks one short follow-up question, not a questionnaire. */
export const QUESTION_MAX_LENGTH = 300;
/** A campaign name is a headline ("Phát hành v1.4"), wider than the 24ch of character and territory names. */
export const CAMPAIGN_NAME_MAX_LENGTH = 60;

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
export const MS_PER_MINUTE = 60_000;
export const MINUTES_PER_HOUR = 60;

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
  /**
   * A judge's session may spend this many times quest.budget.max_tokens (P1-18 proposal (f)): it reads the whole
   * diff and runs the checks again, and the first party run cut a judge at 244 150 of 240 000.
   */
  verifier_tokens_multiplier: 2,
} as const;
/**
 * Tokens read from the prompt cache that count as one token against quest.budget.max_tokens (P1-23). A cache read
 * costs a tenth of an input token (Claude API pricing; a twentieth on Opus 5.5) and does not count toward input
 * rate limits, while Claude Code reads its whole cached context again on every model call: counted in full, reads
 * were 85-90 % of a session's tokens and cut ordinary sessions short (phase-1 report §5.2).
 */
export const CACHE_READS_PER_TOKEN = 10;
/**
 * Verifier sessions of one run a breaker may stop before the review goes to the infirmary (P1-23): each stopped
 * verifier hands the review to a fresh session, which a review too big for its budget would meet again forever.
 */
export const REVIEW_BREAKS_MAX = 2;
/**
 * Partial verdicts of one run before the review goes to the infirmary (P1-42). A partial is progress, so two in a
 * row are allowed (P1-33), but a judge that cannot finish the ritual hands one in every time: in a scratch plot each
 * judge costs a session and, but for a trial kept from the last one, half an hour of checks (P1-35).
 */
export const REVIEW_PARTIALS_MAX = 3;
/**
 * From this rank up, a stronger judge goes first among those the separation rules leave equal (P1-48, P1-16 (l)):
 * "Opus from rank B", by the judge's level, which speaks for its model's strength (P1-38). Below it the order is as
 * before: a judge's session on a strong model costs two to two and a half of a Sonnet assignee's (phase-1 report §6).
 * Not measured yet: no review of rank B or above has compared judges; tune it when one has.
 */
export const STRONG_JUDGE_MIN_RANK = 'B';

export const SCHEDULE_DEFAULTS = {
  chronicle_at: '21:00',
  /**
   * The digest of what waits for the owner (PS-03): in the morning, before the owner's day, so the night's questions
   * and seals are in it. On by default: it costs no mana, and the owner meeting only the digest and the seal is the
   * aim of stage 1.5 (product plan 0.8, section 14).
   */
  digest_at: '08:00',
  /**
   * The Chancellor's triage of the memos waiting (PS-03b): half an hour before the digest, so the digest lists only
   * what is left for the owner. One model call when memos wait, none otherwise.
   */
  triage_at: '07:30',
  temple_every_quests: 10,
  patrol_every: 'P1D',
} as const;

export const DISPATCH_DEFAULTS = {
  tick_seconds: 5,
  /** An answer this soon after the question still finds the session's context, and likely its cache, warm. */
  resume_after_answer_minutes: 55,
  /**
   * Machine work outside the tick at once, kingdom-wide (P1-47, (b) of P1-25): not measured yet, so cautious. Before
   * P1-25 the checks and scripts ran one at a time inside the tick; two let a short check or a script go on beside a
   * trial of half an hour (P1-35), and keep a laptop from running three check suites of a territory like Elvaria
   * (test 108 s, boundaries 122 s, P1-16) at once. The owner raises it in kingdom.json once a run measures the load.
   */
  max_background: 2,
} as const;

// territory.json defaults.
export const TERRITORY_DEFAULTS = {
  worktree_dir: '.elvaria/worktrees',
  max_concurrent: 1,
  context_files: ['CLAUDE.md', 'README.md', '.claude/rules/*.md'],
  /** territory.blind_trial.min_rank (§3.15, ADR 0022): B and above, the ranks worth an acceptance part. */
  blind_trial_min_rank: 'B',
  /**
   * territory.environment_errors (P1-54): what Docker and Docker Compose print when a check's environment failed,
   * not its work. The daemon is down (Q5 of P1-50: Docker Desktop not started yet), or a container the check needs
   * is gone or never got healthy (Q7, Q1, Q2 of P1-50: another quest's commands.reset removed it). Generic Docker
   * lines, no territory's own: a territory adds its own or clears them in its file.
   */
  environment_errors: [
    'Cannot connect to the Docker daemon',
    'error during connect',
    'Docker Desktop is not running',
    'No such container',
    'is unhealthy',
    'missing dependency',
  ],
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
  // A change of behaviour comes with its test when the territory has tests (§3.15, ADR 0022; P1-01).
  'check_tests_cover_change',
  'compare_before_after',
  'score_tone_checklist',
  'rerun_from_source',
  'compare_numbers',
  'challenge_scope',
  'tally_units',
  // Tests as the product (§3.15, ADR 0022; P1-20): the machine reruns the checks in a clean scratch plot, three
  // times, and measures coverage against the base; the judge breaks what the tests guard there and expects red.
  'rerun_clean',
  'flake_check',
  'coverage_not_lower',
  'break_and_expect_red',
  'judge',
  'write_verdict',
] as const;

/**
 * Runs of the checks on one commit under `flake_check` (product plan 0.7 §5 "Chạy 3 lần"): a check that passes in
 * one run and fails in another is flaky.
 */
export const FLAKE_RUNS = 3;

/**
 * Stands in `checks[].flake.run` for the spec files of the check that the quest added or changed (P1-54): the reruns
 * of flake_check repeat those alone instead of the whole suite (P1-50: the trial's machine part took 45–75 minutes on
 * dc1, half of it flake_check running every check twice more).
 */
export const SPECS_PLACEHOLDER = '{specs}';

/**
 * Minutes the checks of a quest wait after they failed because of their environment before they run again (P1-54):
 * long enough for the owner the bell told to start Docker (about a minute on P1-50's machine) or for another quest's
 * work to end, short enough that the quest does not sit for long once the environment is back. Not measured.
 */
export const ENVIRONMENT_RECHECK_MINUTES = 10;

/**
 * Breaks a judge's pass names in a scratch plot whose ritual breaks code (P1-40): the step break_and_expect_red asks
 * for "at least two different places" (runner-core prompts/ritual-steps.md); a pass with fewer is taken as partial.
 */
export const MIN_BREAKS = 2;

/** Beyond what an exclusive check waits out: time for a crashed holder's lock to go stale (store STALE_MS). */
export const LOCK_MARGIN_MINUTES = 1;
