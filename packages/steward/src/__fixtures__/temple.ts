// The temple report specs' bench (PS-12c): a knight and a judge of claude, a Monk of gemini; a fail verdict and a pass
// verdict the operations name; scriptures with ledgers planted on disk; reports dropped in the inbox with source monk.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { openEventLog } from '@elvaria/eventlog';
import { VerdictSchema } from '@elvaria/domain';
import type { Event, InboxCommandInput, ScriptureLedger } from '@elvaria/domain';

import { bench } from './kingdom.ts';
import type { Bench, CastMember } from './kingdom.ts';

export const TEMPLE_CAST = [
  { id: 'kael', cls: 'knight' },
  { id: 'sable', cls: 'judge', model: 'claude-opus-5-5', level: 6 },
  { id: 'sage', cls: 'monk', tribe: 'gemini', model: 'gemini-3.8-flash-low' },
] as const;

export const FAILED = 'q_20261106_7k3m2a-1';
export const PASSED = 'q_20261106_7k3m2a-2';
export const REPORT_TS = '2026-11-19T21:09:58+07:00';

const verdictOf = (id: string, attempt: number, result: 'pass' | 'fail') =>
  VerdictSchema.parse({
    version: 1,
    id,
    quest_id: 'q_20261106_7k3m2a',
    attempt,
    verifier_id: 'machine',
    ritual: 'build_review',
    checks: [],
    result,
    ...(result === 'fail' ? { fail_kind: 'tests_fail' } : {}),
    notes: 'pnpm test fails in src/api/orders.spec.ts: the total ignores the discount.',
    by_human: false,
    created_at: '2026-11-06T09:58:40+07:00',
  });

/** The bench with the two verdicts on disk; (PS-12g) another cast when given. */
export async function templeBench(cast: readonly CastMember[] = TEMPLE_CAST): Promise<Bench> {
  const kingdom = await bench({ cast });
  for (const verdict of [verdictOf(FAILED, 1, 'fail'), verdictOf(PASSED, 2, 'pass')]) {
    const written = await kingdom.store.verdicts.write(verdict);
    if (!written.ok) throw new Error(`fixture: ${written.error.message}`);
  }
  return kingdom;
}

/** Drops a temple report of the Monk sage in the inbox; `id` sends one again under the id it had. */
export async function report(
  kingdom: Bench,
  payload: Record<string, unknown>,
  given?: string,
): Promise<string> {
  const id = given ?? kingdom.ids.ulid();
  const command = { version: 1, id, ts: REPORT_TS, kind: 'temple_report', source: 'monk', payload };
  const written = await kingdom.store.inbox.write(command as unknown as InboxCommandInput);
  if (!written.ok) throw new Error(`fixture: ${written.error.message}`);
  return id;
}

/** A Monk's line with an id, as the ledger keeps it. */
export const monkEntry = (id: string) => ({
  id,
  source: 'monk',
  source_verdict: FAILED,
  added_at: '2026-11-18T09:00:00+07:00',
});

/** Puts a scripture and its ledger on disk, as the owner and an earlier report left them. */
export async function plantScripture(
  kingdom: Bench,
  owner: string,
  text: string,
  lessons: readonly object[] = [],
): Promise<void> {
  const store = kingdom.store.scriptures;
  await store.writeText(owner, text);
  if (lessons.length === 0) return;
  const ledger: unknown = { version: 1, lessons };
  const written = await store.writeLedger(owner, ledger as ScriptureLedger);
  if (!written.ok) throw new Error(`fixture: ${written.error.message}`);
}

export const readKingdom = (kingdom: Bench, relative: string): Promise<string> =>
  readFile(path.join(kingdom.root, ...relative.split('/')), 'utf8');

/** The lines of the log of these types, in order. */
export async function linesOf(kingdom: Bench, ...types: string[]): Promise<Event[]> {
  const { events } = await openEventLog(kingdom.root).read();
  return events.filter(({ type }) => types.includes(type));
}
