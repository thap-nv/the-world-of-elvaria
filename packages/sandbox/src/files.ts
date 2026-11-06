// Where fake days live (implementation-plan §2.2, §7): `events/sandbox/<date>.jsonl` of the kingdom, apart from
// the real log so fake data never looks real. Nothing else of the kingdom is touched: no quest, no character.
import path from 'node:path';

import { createRedactor, eventLogDir, readEventFile, redactDeep, serializeEvent } from '@elvaria/eventlog';
import type { FileBatch } from '@elvaria/eventlog';
import { writeFileAtomic } from '@elvaria/store';

import type { SandboxDay } from './simulate.ts';

/** Native path of the file of a fake day. */
export const dayFilePath = (kingdomDir: string, date: string): string =>
  path.join(eventLogDir(kingdomDir, { sandbox: true }), `${date}.jsonl`);

/**
 * Writes the whole day in one step, replacing an earlier generation of the same date: the file is derived from
 * day, seed and kingdom, so writing it again is the way to change it. Fake lines hold no secrets, yet they are
 * masked anyway, so "redact before append" has no exception (ADR 0013).
 */
export async function writeDay(kingdomDir: string, day: SandboxDay): Promise<string> {
  const file = dayFilePath(kingdomDir, day.date);
  const redactor = createRedactor([]);
  const text = day.events
    .map((event) => serializeEvent(redactDeep(event, redactor)).toString('utf8'))
    .join('');
  await writeFileAtomic(file, text);
  return file;
}

/** Every line of a day file, upgraded and checked by the event log's reader; unusable lines are issues. */
export const readDay = (file: string): Promise<FileBatch> => readEventFile(file);
