// Defaults and limits of the v1 contracts the zod schemas check (implementation-plan §2.3).

/** `.elv-name` is 24ch wide: kingdom, territory and character names must fit it. */
export const NAME_MAX_LENGTH = 24;
export const TAG_NAME_MAX_LENGTH = 40;
export const TAG_DESCRIPTION_MAX_LENGTH = 200;
/** The Chancellor asks one short follow-up question, not a questionnaire. */
export const QUESTION_MAX_LENGTH = 300;
/** A campaign name is a headline ("Phát hành v1.4"), wider than the 24ch of character and territory names. */
export const CAMPAIGN_NAME_MAX_LENGTH = 60;

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
  /**
   * The patrol (PS-26): before the triage and the digest, so the day's digest carries what it found. It runs each
   * patrolled territory's setup and checks, minutes each, outside the tick.
   */
  patrol_at: '06:30',
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
 * territory.delivery (§3.16.7, ADR 0023; PS-08): what a territory delivers by when its file names no delivery, or
 * names one without these keys. `manual` is stage 1's delivery: the branch waits for the owner. An hour of the forge's
 * checks before the Steward stops waiting is (V) of the PS-08 plan.
 */
export const DELIVERY_DEFAULTS = {
  mode: 'manual',
  forge: 'github',
  merge_method: 'merge',
  checks_timeout_minutes: 60,
} as const;
/** delivery.failed `detail`: one forge or git message, redacted, never a whole log. */
export const DELIVERY_DETAIL_MAX_LENGTH = 2000;

/**
 * territory.check_policy (CM-01, ADR 0032): what a territory checks by when its file names no policy, or names one
 * without these keys. `full` is the behaviour before CM-01, so no kingdom changes when it upgrades. The train's
 * numbers are C10 of plans/check-modes.md, read by CM-08.
 */
export const CHECK_POLICY_DEFAULTS = {
  mode: 'full',
  train: { max_quests: 5, max_wait_minutes: 30 },
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
  // The council's readiness review (PS-06, ADR 0028): what the machine cannot check of a plan.
  'check_plan_ready',
  'check_sources',
  'cross_check_sources',
  'check_regression_test',
  // A change of behaviour comes with its test when the territory has tests (§3.15, ADR 0022; P1-01).
  'check_tests_cover_change',
  // The judge reads the screens the checks captured against their references (PS-11, `visual_review`).
  'compare_screens',
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
 * Stands in `checks[].flake.run` for the spec files of the check that the quest added or changed (P1-54): the reruns
 * of flake_check repeat those alone instead of the whole suite (P1-50: the trial's machine part took 45–75 minutes on
 * dc1, half of it flake_check running every check twice more).
 */
export const SPECS_PLACEHOLDER = '{specs}';
