// What a new infirmary reason or breaker trip must come with (settlement (82), fix/session-notes; .claude/rules/
// domain.md): its code and parameters in INFIRMARY_REASONS / INFIRMARY_REASON_PARAMS, and its row in the contract's
// table (docs/contracts/infirmary-reason-codes.md §2), in the same order. breakAssignee builds `breaker:${trip}` from a
// trip cast to SessionTrip (breaker.ts), so the compiler lets a trip without a code through: this spec does not. The
// VI/EN strings of each code are apps/cli's (quest/infirmary-reason.spec.ts).
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { BREAKER_TRIPS, INFIRMARY_REASON_PARAMS, INFIRMARY_REASONS } from '@elvaria/domain';
import type { BreakerTrip } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

const CONTRACT = path.join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'docs',
  'contracts',
  'infirmary-reason-codes.md',
);
/** §2's table; §4.2's (doctor notes) has no "Ai ghi" column. */
const HEADER = '| Mã | Ai ghi | Tham số | Nghĩa |';

/** Trips whose infirmary line names its code by what went wrong, not `breaker:<trip>` (secrets.ts). */
const NAMED_ELSEWHERE: ReadonlySet<BreakerTrip> = new Set(['secrets']);

interface Row {
  readonly code: string;
  readonly params: readonly string[];
}

/** The rows of the contract's §2 table, in order: each code and its parameters, `(không)` being none. */
async function contractRows(): Promise<Row[]> {
  const lines = (await readFile(CONTRACT, 'utf8')).split(/\r?\n/);
  const start = lines.indexOf(HEADER);
  if (start === -1) throw new Error(`${CONTRACT} has no table headed ${HEADER}`);
  const rows: Row[] = [];
  // After the header, its `|---|` line; the table ends at the first line that is not a row.
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break;
    const [, code = '', , params = ''] = line.split('|').map((cell) => cell.trim());
    const names = [...params.matchAll(/`([^`]+)`/g)].map(([, name]) => name ?? '');
    rows.push({ code: code.replaceAll('`', ''), params: names });
  }
  return rows;
}

describe('infirmary reason codes and their contract', () => {
  it('has a row in the contract for every code, in order, with its parameters', async () => {
    const declared = INFIRMARY_REASONS.map((code) => ({ code, params: INFIRMARY_REASON_PARAMS[code] }));
    expect(await contractRows()).toEqual(declared);
  });

  it('has a code for every trip breakAssignee names by itself', () => {
    const named = BREAKER_TRIPS.filter((trip) => !NAMED_ELSEWHERE.has(trip));
    const codes: readonly string[] = INFIRMARY_REASONS;
    expect(named.filter((trip) => !codes.includes(`breaker:${trip}`))).toEqual([]);
    for (const trip of NAMED_ELSEWHERE)
      expect(codes.some((code) => code.startsWith(`breaker:${trip}_`))).toBe(true);
  });
});
