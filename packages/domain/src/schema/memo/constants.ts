// Numbers and closed lists of the memo contract (PS-02, implementation-plan §3.16.2, ADR 0024).

/** One matter in a sentence or two (ADR 0024: one letter, one matter); a longer text is a quest's description. */
export const MEMO_BODY_MAX_LENGTH = 2000;
/** The files a memo points to; a memo about more is more than one matter. */
export const MEMO_REFS_MAX = 20;
/** A path relative to the plot, as git prints it. */
export const MEMO_REF_MAX_LENGTH = 300;

/**
 * Where a kind of memo goes (`registry/memos.json`). (PS-22) `judge`: a second judge reads the objection beside the
 * verdict it contests; `owner`: the owner decides it, which is where an objection goes when no judge may take it
 * (OBJECTION_REFUSALS). PS-09 and PS-10 add the routes of advisory and request.
 */
export const MEMO_ROUTES = ['chancellor', 'judge', 'owner'] as const;
/** A memo waits for a decision while open; nobody answers it (ADR 0024), it is decided once and closed. */
export const MEMO_STATES = ['open', 'closed'] as const;
/** What the owner (or, from PS-03b, the Chancellor's triage) decided: set aside, refused, or done by a quest. */
export const MEMO_DECISIONS = ['shelved', 'rejected', 'handled'] as const;
/**
 * What became of an objection the second judge read (PS-22): `sustained` when its verdict passed the work the
 * contested verdict had failed, `overruled` when it failed it again. The Steward closes the memo so; the owner never
 * picks these.
 */
export const MEMO_JUDGEMENTS = ['sustained', 'overruled'] as const;
/** Every way a memo is closed: the owner's decisions and the second judge's (PS-22). */
export const MEMO_OUTCOME_DECISIONS = [...MEMO_DECISIONS, ...MEMO_JUDGEMENTS] as const;
/**
 * Why an objection goes to the owner instead of a judge (PS-22, ADR 0024: one per verdict, the second verdict is
 * final): the run came back with no fail to contest; the owner's own return; a verdict that answered an objection
 * already; a verdict another objection contests already.
 */
export const OBJECTION_REFUSALS = [
  'no_verdict',
  'owner_verdict',
  'final_verdict',
  'second_objection',
] as const;
