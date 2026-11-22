// Numbers and defaults that two or more domain folders decide with (implementation-plan §4.2). A number one
// folder uses lives in that folder's constants.ts (architecture-health R2, AH-03).

// Shared by quest, quest-draft and the create_quest / declare_campaign commands.
export const QUEST_TITLE_MAX_LENGTH = 120;
/** Tags rank candidates by reputation per tag (character.skill_affinity), so a quest carries only a few. */
export const QUEST_TAGS_MAX = 6;
export const MS_PER_MINUTE = 60_000;

export const BREAKER_DEFAULTS = {
  estimate_factor: 1.82,
  soft_pct: 85,
  hard_pct: 150,
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
/** patrol.ran's error lines (PS-26): the first line of a log that says what went wrong, never more. */
export const PATROL_LINE_MAX_LENGTH = 500;
