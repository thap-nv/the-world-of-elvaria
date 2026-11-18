// The kingdom's delegation (implementation-plan §3.16.3, PS-03b; product plan 0.8 §14 "phạm vi ủy quyền"): what the
// world decides alone of the memos the Chancellor triages, and what goes to the owner. Apart from delegation.ts so
// the kingdom's and the memo's schemas can name the lists without importing the function.

/**
 * The closed list of matters the owner keeps (product plan 0.8 §14): the Chancellor flags those it sees in a memo,
 * and the machine sees `protected_paths` too (a memo's files under the territory's laws.protected_paths);
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
 * quest that would do it (`delegation.same_scope`); the files an accepted amendment opens meet a scope another quest
 * holds (R3, ADR 0028; fix/amendment-delegation); the Chancellor itself sent the memo up (or its draft asks a
 * question, which only the owner answers).
 */
export const DELEGATION_LIMITS = ['above_rank', 'outside_scope', 'scope_held', 'chancellor_asks'] as const;
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

/**
 * Delegation of the seal (PS-08b, ADR 0023; K9 (2) of the merge queue plan): the most lines a delegated quest's branch
 * may add and remove together, the territory's `regenerate` shared paths aside, before the machine raises the seal.
 */
export const SEAL_DIFF_LINES_DEFAULT = 400;

/**
 * Why the machine raised the seal of a quest the delegation spared it (PS-08b): the machine only ever raises it. At a
 * submit: its work changed a protected path (ADR 0026), a character above its level's ceiling took it, files outside
 * its scope_paths, a diff over `max_diff_lines`. At a pass: the judge is not of another family than every doer (an
 * unknown family counts as the same), the machine judged alone, the review answered an objection. At both: its rank is
 * now above `max_rank`, the delegation no longer covers it (gone, its kind no longer listed, its territory no longer
 * `pr_merge`), or its territory's delegation is suspended (PS-08g).
 */
export const SEAL_RAISES = [
  'protected_paths',
  'above_level',
  'out_of_scope',
  'diff_size',
  'same_family_judge',
  'machine_judge',
  'objection',
  'rank_above',
  'out_of_delegation',
  'suspended',
] as const;
export type SealRaise = (typeof SEAL_RAISES)[number];
