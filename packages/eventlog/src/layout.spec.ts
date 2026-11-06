import path from 'node:path';

import { QUEST_ID_PATTERN } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { EventLogError } from './errors.ts';
import {
  QUEST_ID_SHAPE,
  dayFileName,
  dayOfFileName,
  dayOfTs,
  eventLogDir,
  journalOf,
  journalPath,
} from './layout.ts';

describe('layout', () => {
  it('repeats the domain quest id pattern exactly (the copy exists only to keep the domain unloaded)', () => {
    expect(QUEST_ID_SHAPE.source).toBe(QUEST_ID_PATTERN.source);
    expect(QUEST_ID_SHAPE.flags).toBe(QUEST_ID_PATTERN.flags);
  });

  it('puts an event in the file of the date written in its ts, whatever the offset', () => {
    expect(dayOfTs('2026-11-06T23:59:59+07:00')).toBe('2026-11-06');
    expect(dayOfTs('2026-11-07T00:00:00.123+07:00')).toBe('2026-11-07');
    expect(dayOfTs('2026-11-06T16:59:59Z')).toBe('2026-11-06');
    expect(dayOfTs('06/11/2026 09:00')).toBeUndefined();
    expect(dayOfTs('')).toBeUndefined();
  });

  it('names day files and recognises only them in the log folder', () => {
    expect(dayFileName('2026-11-06')).toBe('2026-11-06.jsonl');
    expect(dayOfFileName('2026-11-06.jsonl')).toBe('2026-11-06');
    expect(dayOfFileName('sandbox')).toBeUndefined();
    expect(dayOfFileName('2026-11-06.jsonl.tmp')).toBeUndefined();
    expect(dayOfFileName('.2026-11-06.jsonl')).toBeUndefined();
  });

  it('keeps the sandbox log in its own folder', () => {
    const root = path.join('kingdom root');
    expect(eventLogDir(root)).toBe(path.join(root, 'events'));
    expect(eventLogDir(root, { sandbox: true })).toBe(path.join(root, 'events', 'sandbox'));
  });

  it('builds a journal path only from a quest id, so an id from the environment cannot leave quests/', () => {
    const root = path.join('kingdom root');
    expect(journalOf('q_20261106_7k3m2a')).toBe('quests/q_20261106_7k3m2a/journal.jsonl');
    expect(journalPath(root, 'q_20261106_7k3m2a')).toBe(
      path.join(root, 'quests', 'q_20261106_7k3m2a', 'journal.jsonl'),
    );
    for (const bad of ['../../etc', 'q_20261106_7k3m2a/../x', '', 'q_2026_7k3m2a']) {
      expect(() => journalPath(root, bad)).toThrow(EventLogError);
    }
    try {
      journalPath(root, '..');
    } catch (error) {
      expect(error).toMatchObject({ code: 'invalid_quest_id', name: 'EventLogError' });
    }
  });
});
