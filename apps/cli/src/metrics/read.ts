// The files the metrics ledger reads (implementation-plan §3.16.1): quests, verdicts, the event log, the inbox
// commands the Steward handled (inbox/done/: the quest of a command, and the kind of a line written before PS-01b) and
// the characters (the tribe of a session, PS-28c) and the scriptures (what each line is for, PS-12b).
// Everything is read, nothing written: no lock, no migration written back, so a kingdom is measured while its
// Steward runs, or stopped. Shared with scripts/docs-metrics-report.mjs, so the report and the command count alike.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { InboxCommandSchema } from '@elvaria/domain';
import type { CharacterId, InboxCommand, LessonFact, MetricsInput } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { lessonsIn } from '@elvaria/steward';
import type { Scripture } from '@elvaria/steward';
import { inKingdom, kingdomLayout, openKingdom, readTextFile, toPortable } from '@elvaria/store';

/** inbox/done/ of the kingdom layout (packages/store layout.ts); the store has no reader for handled commands. */
const INBOX_DONE = ['inbox', 'done'] as const;

export interface MetricsSource {
  readonly input: MetricsInput;
  /**
   * The sentence of each line the scriptures hold now, by the ref a load trace names it with: the lessons table of the
   * view joins it when it prints. The ledger itself does not carry it (PS-12b: it reads no scripture).
   */
  readonly sentences: ReadonlyMap<string, string>;
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

/** The temple's scripture and every character's that exists, as the Steward reads them to load a prompt. */
async function readScriptures(
  root: string,
  characters: readonly { readonly id: CharacterId }[],
): Promise<Scripture[]> {
  const files = [
    { file: kingdomLayout.templeScripture(), owner: 'temple' },
    ...characters.map(({ id }) => ({ file: kingdomLayout.scripture(id), owner: id })),
  ];
  const read = await Promise.all(
    files.map(async ({ file, owner }) => ({ file, owner, text: await readTextFile(inKingdom(root, file)) })),
  );
  return read.flatMap(({ file, owner, text }) => (text === undefined ? [] : [{ file, owner, text }]));
}

/**
 * What the lines say of themselves, once for each ref: the same sentence in the temple's file and a character's is one
 * lesson (PS-12 (i)), and the first line read speaks for it.
 */
function lessonFactsOf(scriptures: readonly Scripture[]): {
  facts: LessonFact[];
  sentences: Map<string, string>;
} {
  const facts = new Map<string, LessonFact>();
  const sentences = new Map<string, string>();
  for (const { ref, fail_kind, scope, text } of lessonsIn(scriptures)) {
    if (facts.has(ref)) continue;
    facts.set(ref, { ref, fail_kind, scope });
    sentences.set(ref, text);
  }
  return { facts: [...facts.values()], sentences };
}

/** What the ledger reads from the kingdom at `dir`. */
export async function readMetricsSource(dir: string): Promise<MetricsSource> {
  const store = openKingdom(dir);
  const [quests, verdicts, log, inbox, characters] = await Promise.all([
    store.quests.list(),
    store.verdicts.list(),
    openEventLog(store.root).read(),
    readHandledCommands(store.root),
    store.characters.list(),
  ]);
  const { facts, sentences } = lessonFactsOf(await readScriptures(store.root, characters.items));
  return {
    input: {
      quests: quests.items,
      verdicts: verdicts.items,
      events: log.events,
      commands: inbox.commands,
      characters: characters.items,
      lessons: facts,
    },
    sentences,
    skipped: [
      ...[...quests.issues, ...verdicts.issues, ...characters.issues].map(
        ({ file, message }) => `${file}: ${message}`,
      ),
      ...log.issues.map(
        ({ file, offset, message }) => `${toPortable(path.relative(store.root, file))}@${offset}: ${message}`,
      ),
      ...inbox.skipped,
    ],
  };
}
