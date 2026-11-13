// The kingdom's delegation (implementation-plan §3.16.3, PS-03b; product plan 0.8 §14 "phạm vi ủy quyền"): what the
// world decides alone of the memos the Chancellor triages, and what goes to the owner. Apart from delegation.ts so
// the kingdom's and the memo's schemas can name the lists without importing the function.

/**
 * The closed list of matters the owner keeps (product plan 0.8 §14): the Chancellor flags those it sees in a memo;
 * `kingdom.delegation.ask` says which of them send it to the owner (all by default).
 */
export const DELEGATION_ASK_REASONS = [
  'decision_change',
  'contract_change',
  'mana_over_budget',
  'outward_action',
  'protected_paths',
] as const;
export type DelegationAskReason = (typeof DELEGATION_ASK_REASONS)[number];

/**
 * What the machine finds on its own: the work's rank above `delegation.max_rank`; its files outside the scope of the
 * quest that would do it (`delegation.same_scope`); the Chancellor itself sent the memo up (or its draft asks a
 * question, which only the owner answers).
 */
export const DELEGATION_LIMITS = ['above_rank', 'outside_scope', 'chancellor_asks'] as const;
export type DelegationLimit = (typeof DELEGATION_LIMITS)[number];

/** Why a memo goes to the owner: a reason the kingdom keeps, or a limit the machine found. */
export const DELEGATION_HOLDS = [...DELEGATION_ASK_REASONS, ...DELEGATION_LIMITS] as const;
export type DelegationHold = (typeof DELEGATION_HOLDS)[number];

/**
 * What the Chancellor does with a memo (product plan 0.8 §14): merge it into an open quest, make a new quest of it,
 * set it aside, or send it to the owner.
 */
export const TRIAGE_ACTIONS = ['merge', 'new_quest', 'shelve', 'owner'] as const;
export type TriageAction = (typeof TRIAGE_ACTIONS)[number];

/**
 * The world takes a proposal in up to this rank by default: F to D are the ranks whose quests the Chancellor drafts
 * with steps in order (PS-06), small enough that the owner reads them in the digest after the fact.
 */
export const DELEGATION_MAX_RANK_DEFAULT = 'D';

/** Quests a merge may name: work not begun yet, so its first session reads the merged text. */
export const MERGEABLE_STATUSES = ['draft', 'open'] as const;
