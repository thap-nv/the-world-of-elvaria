// The task's "done when" for redaction (implementation-plan §3.9, §8 P0-05; ADR 0013): a transcript with
// every kind of secret goes through redaction into the log and a journal, and not one secret is on disk.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { tempDir } from '../test/temp.ts';
import { DAY_1, QUEST, QUEST_VIEW, makeEvent } from './__fixtures__/events.ts';
import { KNOWN_SECRET, SECRET_SAMPLES } from './__fixtures__/secrets.ts';
import { openEventLog, openJournal } from './event-log.ts';
import { REDACTED, createRedactor, redactDeep } from './redact.ts';
import type { TempDir } from '../test/temp.ts';
import type { Event } from '@elvaria/domain';

const MIN_KINDS = 12;

/** The same secrets in the fields a hook fills: a command, a blocked reason, a path, an infirmary reason. */
function transcript(): Event[] {
  return SECRET_SAMPLES.flatMap(({ line }, n) => [
    makeEvent(DAY_1, 4 * n, { data: { tool: 'bash', command: line, exit: 1 } }),
    makeEvent(DAY_1, 4 * n + 1, { type: 'agent.tool.blocked', data: { tool: 'bash', reason: line } }),
    makeEvent(DAY_1, 4 * n + 2, { data: { tool: 'write', path: line } }),
    makeEvent(DAY_1, 4 * n + 3, {
      type: 'quest.infirmary',
      data: { reason: { code: 'legacy', params: { text: line } }, quest: QUEST_VIEW },
    }),
  ]);
}

describe('secrets fixture', () => {
  let temp: TempDir;
  beforeEach(async () => {
    temp = await tempDir();
  });
  afterEach(() => temp.remove());

  it(`covers at least ${MIN_KINDS} kinds of secret`, () => {
    expect(new Set(SECRET_SAMPLES.map((sample) => sample.kind)).size).toBeGreaterThanOrEqual(MIN_KINDS);
  });

  it('leaves 0 occurrences of any secret in the log and the journal, and every line still valid', async () => {
    const redactor = createRedactor([KNOWN_SECRET]);
    const events = transcript().map((event) => redactDeep(event, redactor));
    const log = openEventLog(temp.root);
    const journal = openJournal(temp.root, QUEST);
    await log.append(events);
    await journal.append(events);

    const files = [path.join(log.dir, '2026-11-06.jsonl'), journal.file];
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      for (const { kind, secret } of SECRET_SAMPLES) {
        expect(text.includes(secret), `${kind} in ${path.basename(file)}`).toBe(false);
        expect(text.includes(JSON.stringify(secret).slice(1, -1)), `${kind}, JSON-escaped`).toBe(false);
      }
      expect(text).toContain(REDACTED);
    }
    const read = await log.read();
    expect(read.issues).toEqual([]);
    expect(read.events).toEqual(events);
    expect((await journal.read()).events).toEqual(events);
  });
});
