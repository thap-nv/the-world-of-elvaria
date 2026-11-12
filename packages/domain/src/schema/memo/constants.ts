// Numbers and closed lists of the memo contract (PS-02, implementation-plan §3.16.2, ADR 0024).

/** One matter in a sentence or two (ADR 0024: one letter, one matter); a longer text is a quest's description. */
export const MEMO_BODY_MAX_LENGTH = 2000;
/** The files a memo points to; a memo about more is more than one matter. */
export const MEMO_REFS_MAX = 20;
/** A path relative to the plot, as git prints it. */
export const MEMO_REF_MAX_LENGTH = 300;

/** Where a kind of memo goes (`registry/memos.json`). PS-09 and PS-10 add the routes of advisory and objection. */
export const MEMO_ROUTES = ['chancellor'] as const;
/** A memo waits for a decision while open; nobody answers it (ADR 0024), it is decided once and closed. */
export const MEMO_STATES = ['open', 'closed'] as const;
/** What the owner (or, from PS-03b, the Chancellor's triage) decided: set aside, refused, or done by a quest. */
export const MEMO_DECISIONS = ['shelved', 'rejected', 'handled'] as const;
