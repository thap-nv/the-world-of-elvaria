// Numbers of the temple (temple-first plan, PS-12): what one session loads of the scriptures and how a line is named.

/**
 * A session loads at most this many lessons, counted after scope filtering over the character's scripture and the
 * temple's together, the character's first (temple-first plan DB4, lesson-sharing S6); a file has no cap of its own.
 */
export const SCRIPTURE_LINES_MAX = 40;

/** The base32 digits of the ref `T_…` of a line without an id: 50 bits of a hash of its sentence (DB5). */
export const LESSON_TEXT_REF_CHARS = 10;
