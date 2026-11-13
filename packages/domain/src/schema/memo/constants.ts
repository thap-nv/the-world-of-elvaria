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
 * (OBJECTION_REFUSALS). (PS-22b) `author`: whoever wrote the quest's description decides an amendment, the Chancellor
 * or the mage of its plan; one no author may decide goes to the owner (AMENDMENT_REFUSALS). PS-09 and PS-10 add the
 * routes of advisory and request.
 */
export const MEMO_ROUTES = ['chancellor', 'judge', 'owner', 'author'] as const;
/** A memo waits for a decision while open; nobody answers it (ADR 0024), it is decided once and closed. */
export const MEMO_STATES = ['open', 'closed'] as const;
/**
 * What the owner (or, from PS-03b, the Chancellor's triage) decided: set aside, refused, or done by a quest.
 * (PS-22b) `accepted`: an amendment its quest's author (or the owner) took, the description rewritten so.
 */
export const MEMO_DECISIONS = ['shelved', 'rejected', 'handled', 'accepted'] as const;

/**
 * Memos one triage reads (PS-03b): one model call per batch, the oldest first; the rest wait for the next run. Twenty
 * one-line memos with their quests' scopes fit a short prompt.
 */
export const TRIAGE_MEMOS_MAX = 20;
/** The Chancellor's word on one memo: why, in a sentence or two, for the owner and the memo's outcome. */
export const TRIAGE_NOTE_MAX_LENGTH = 1000;

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

/**
 * Why an amendment goes to the owner instead of its quest's author (PS-22b, ADR 0024): no character wrote the
 * description (the owner did, the machine did, or the mage of its plan is gone); the quest's rank is below
 * `kingdom.dispatch.amendments.from_rank`, so no author's session is spent on it; the quest had an amendment
 * already, so the doer and the author never argue back and forth.
 */
export const AMENDMENT_REFUSALS = ['no_author', 'below_rank', 'second_amendment'] as const;
/** Every reason a memo goes to the owner instead of where its kind goes. */
export const MEMO_REFUSALS = [...OBJECTION_REFUSALS, ...AMENDMENT_REFUSALS] as const;

/**
 * What an amendment's author decides in its session (PS-22b): take it and rewrite the description, refuse it, or
 * hand it to the owner (it changes what the owner asked for, a party's contract, or more than the kingdom's
 * delegation lets the world decide).
 */
export const AMENDMENT_DECISIONS = ['accepted', 'rejected', 'owner'] as const;
/**
 * Who a quest blocked on an amendment waits for (PS-22b): its author, in an off-tick session; or the owner, who
 * answers it as a question (the author handed it on, or it went to the owner when filed).
 */
export const AMENDMENT_DECIDERS = ['author', 'owner'] as const;
export type AmendmentDecider = (typeof AMENDMENT_DECIDERS)[number];
/** Every rank by default (kingdom.dispatch.amendments.from_rank): the metrics say when to raise it. */
export const AMENDMENTS_FROM_RANK_DEFAULT = 'F';
/** The author's why, read by the doer's next session and by the owner: a sentence or a short paragraph. */
export const AMENDMENT_NOTE_MAX_LENGTH = 1000;
