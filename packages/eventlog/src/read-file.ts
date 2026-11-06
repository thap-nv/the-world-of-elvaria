// Events of one JSONL file from a byte offset: a quest's journal, or a single day file (sandbox replay).
import { readLines } from './read-lines.ts';
import { loadEventSchema } from './schema.ts';
import { parseEventLine } from './parse-line.ts';
import type { EventLogIssue } from './issues.ts';
import type { Event } from '@elvaria/domain';

export interface FileBatch {
  readonly events: readonly Event[];
  readonly issues: readonly EventLogIssue[];
  /** Offset after the last complete line read: pass it back to read only what came after. */
  readonly offset: number;
  /** Bytes after `offset` that do not end with a newline yet: a line being written, or a writer's crash. */
  readonly pending: number;
}

/** Every complete line of `file` after byte `from`, upgraded and checked; a missing file has no events. */
export async function readEventFile(file: string, from = 0): Promise<FileBatch> {
  const schema = await loadEventSchema();
  const read = await readLines(file, from);
  const events: Event[] = [];
  const issues: EventLogIssue[] = [];
  if (read.restarted) {
    issues.push({
      code: 'truncated',
      file,
      offset: from,
      message: `the file has ${read.size} bytes, fewer than the offset ${from}; read again from the start`,
    });
  }
  for (const line of read.lines) {
    const parsed = parseEventLine(line.text, schema);
    if (parsed.ok) events.push(parsed.value);
    else issues.push({ ...parsed.error, file, offset: line.offset });
  }
  return { events, issues, offset: read.offset, pending: read.size - read.offset };
}
