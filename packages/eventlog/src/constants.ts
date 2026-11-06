// The event log's numbers, named once (implementation-plan §2.1, §6, §9.2).

/**
 * Upper bound of one line, newline included. Every line is one write() on a file opened for append, which
 * both Windows and macOS put at the end of the file in one piece, so two writers never interleave (§9.2).
 */
export const MAX_LINE_BYTES = 64 * 1024;

/** How often a tail looks at the day files: polling, because fs.watch is unreliable on Windows (§6). */
export const TAIL_INTERVAL_MS = 500;

/**
 * Day files a cursor keeps an offset for. Two, not one: a line stamped just before midnight can be appended
 * after the next day's file has appeared, and a reader that had already moved on would never see it.
 */
export const WATCHED_DAY_FILES = 2;

/** Bytes per read() when reading a file forward; a day of a busy kingdom is a few MB. */
export const READ_CHUNK_BYTES = 1024 * 1024;

export const NEWLINE = 0x0a;
