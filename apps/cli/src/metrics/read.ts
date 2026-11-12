// The files the metrics ledger reads (implementation-plan §3.16.1): quests, verdicts, the event log and the inbox
// commands the Steward handled (inbox/done/: the quest of a command, and the kind of a line written before PS-01b).
// Everything is read, nothing written: no lock, no migration written back, so a kingdom is measured while its
// Steward runs, or stopped. Shared with scripts/docs-metrics-report.mjs, so the report and the command count alike.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { InboxCommandSchema } from '@elvaria/domain';
import type { InboxCommand, MetricsInput } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { openKingdom, toPortable } from '@elvaria/store';

/** inbox/done/ of the kingdom layout (packages/store layout.ts); the store has no reader for handled commands. */
const INBOX_DONE = ['inbox', 'done'] as const;

export interface MetricsSource {
  readonly input: MetricsInput;
  /** Files or lines the reader could not use and left out, each as `<where>: <why>` (English, as the store says). */
  readonly skipped: readonly string[];
}

const errorCode = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;

async function namesIn(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((name) => name.endsWith('.json') && !name.startsWith('.')).sort();
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return [];
    throw error;
  }
}

/** The handled commands, each checked against its schema; one that fails is skipped and named. */
async function readHandledCommands(root: string): Promise<{ commands: InboxCommand[]; skipped: string[] }> {
  const dir = path.join(root, ...INBOX_DONE);
  const commands: InboxCommand[] = [];
  const skipped: string[] = [];
  for (const name of await namesIn(dir)) {
    const where = [...INBOX_DONE, name].join('/');
    try {
      const parsed = InboxCommandSchema.safeParse(JSON.parse(await readFile(path.join(dir, name), 'utf8')));
      if (parsed.success) commands.push(parsed.data);
      else skipped.push(`${where}: does not match the inbox command schema`);
    } catch {
      skipped.push(`${where}: not JSON`);
    }
  }
  return { commands, skipped };
}

/** What the ledger reads from the kingdom at `dir`. */
export async function readMetricsSource(dir: string): Promise<MetricsSource> {
  const store = openKingdom(dir);
  const [quests, verdicts, log, inbox] = await Promise.all([
    store.quests.list(),
    store.verdicts.list(),
    openEventLog(store.root).read(),
    readHandledCommands(store.root),
  ]);
  return {
    input: { quests: quests.items, verdicts: verdicts.items, events: log.events, commands: inbox.commands },
    skipped: [
      ...[...quests.issues, ...verdicts.issues].map(({ file, message }) => `${file}: ${message}`),
      ...log.issues.map(
        ({ file, offset, message }) => `${toPortable(path.relative(store.root, file))}@${offset}: ${message}`,
      ),
      ...inbox.skipped,
    ],
  };
}
