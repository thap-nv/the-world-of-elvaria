// Numbers of the quest, quest-draft and verdict contracts, named once. Values come from the v1 contracts in
// docs/schemas/ (implementation-plan §2.3).

/** Drafts one Chancellor reply may hold. */
export const DRAFTS_MAX = 12;
/** Fail notes are required and specific (implementation-plan §2.3): the assignee retries from them alone. */
export const FAIL_NOTES_MIN_LENGTH = 20;
