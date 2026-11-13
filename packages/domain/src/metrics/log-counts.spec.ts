import { describe, expect, it } from 'vitest';

import { at, commandOf, lineOf, questId } from './__fixtures__/ledger.ts';
import { ownerCommandsOf } from './ledger.ts';
import { outOfScopeOf, readsOf, setAsidesOf } from './log-counts.ts';
import type { Event } from '../schema/event/event.ts';

const NEXT_DAY = '2026-11-09';
const ON_THE_DAY = { since: '2026-11-08', until: '2026-11-08' } as const;

/** A line a session's hook wrote: its session, its quest, its run. */
const heard = (line: Event, session: string | undefined, quest = questId(1)): Event => ({
  ...line,
  ...(session === undefined ? {} : { session }),
  quest,
  attempt: 1,
});

const read = (path: string | undefined, session: string | undefined, minute = 3, day?: string): Event =>
  heard(
    lineOf('agent.tool', { tool: 'read', ...(path === undefined ? {} : { path }) }, at(minute, day)),
    session,
  );

describe('readsOf (PS-01b, after Q10 of P1-50)', () => {
  // One session lists a 1 MB file three times and another file once; a second session reads the big file twice.
  const big = 'apps/web/src/locales/vi.json';
  const events = [
    read(big, 's1'),
    read(big, 's1'),
    read('README.md', 's1'),
    read(big, 's1'),
    heard(read(big, 's2'), 's2', questId(2)),
    heard(read(big, 's2'), 's2', questId(2)),
    // Counted, but no session's: the line names none.
    read(big, undefined),
    read(big, undefined),
    // Not reads of a file: a write, a read with no path, the next day's.
    heard(lineOf('agent.tool', { tool: 'write', path: big }, at(4)), 's1'),
    read(undefined, 's1'),
    read(big, 's1', 5, NEXT_DAY),
  ];

  it('counts the reads of each file in each session, the most read first', () => {
    expect(readsOf(events, ON_THE_DAY)).toEqual({
      total: 8,
      repeated: [
        { session: 's1', quest: questId(1), path: big, reads: 3 },
        { session: 's2', quest: questId(2), path: big, reads: 2 },
      ],
    });
  });

  it('counts the whole log without a window, and orders equal counts by session, then path', () => {
    const tied = [read('b.md', 's3'), read('b.md', 's3'), read('a.md', 's3'), read('a.md', 's3')];
    expect(
      readsOf([...events, ...tied], {}).repeated.map(
        ({ session, path, reads }) => `${session} ${path} ${reads}`,
      ),
    ).toEqual([`s1 ${big} 4`, `s2 ${big} 2`, 's3 a.md 2', 's3 b.md 2']);
  });

  it('keeps a session whose lines name no quest under none', () => {
    const lost = { ...lineOf('agent.tool', { tool: 'read', path: big }, at(3)), session: 's4' };
    expect(readsOf([lost, lost], {}).repeated).toEqual([{ session: 's4', quest: null, path: big, reads: 2 }]);
  });
});

describe('setAsidesOf (PS-01b, (b) of P1-54)', () => {
  const environment = { check: 'e2e', line: 'Cannot connect to the Docker daemon' };
  const end = (data: Record<string, unknown>, minute: number, quest?: string) =>
    lineOf(
      'check.end',
      { outcome: 'fail', checks: [{ id: 'e2e', pass: false, duration_ms: 9 }], ...data },
      at(minute),
      quest,
    );

  it('lists the runs set aside inside the window, a failing run without an environment left out', () => {
    const events = [
      { ...end({ environment }, 3, questId(1)), attempt: 2 },
      end({}, 4, questId(1)),
      end({ environment }, 5),
      lineOf('check.end', { outcome: 'fail', checks: [], environment }, at(1, NEXT_DAY), questId(2)),
    ];
    expect(setAsidesOf(events, ON_THE_DAY)).toEqual([
      { quest: questId(1), attempt: 2, check: 'e2e', at: at(3) },
      { quest: null, attempt: null, check: 'e2e', at: at(5) },
    ]);
    expect(setAsidesOf(events, {})).toHaveLength(3);
  });
});

describe('outOfScopeOf (PS-05, ADR 0028)', () => {
  const submitted = (data: Record<string, unknown>, minute: number, quest?: string, day?: string) =>
    lineOf('quest.submitted', data, at(minute, day), quest);

  it('lists the submits that changed files outside their scope inside the window, the others left out', () => {
    const events = [
      submitted({ out_of_scope: ['docs/a.md', 'README.md'] }, 3, questId(1)),
      submitted({}, 4, questId(2)),
      lineOf('quest.claimed', { out_of_scope: ['x'] }, at(5), questId(3)),
      submitted({ out_of_scope: ['x.ts'] }, 6),
      submitted({ out_of_scope: ['y.ts'] }, 1, questId(4), NEXT_DAY),
    ];
    expect(outOfScopeOf(events, ON_THE_DAY)).toEqual([
      { quest: questId(1), at: at(3), paths: ['docs/a.md', 'README.md'] },
      { quest: null, at: at(6), paths: ['x.ts'] },
    ]);
    expect(outOfScopeOf(events, {})).toHaveLength(3);
  });
});

describe("ownerCommandsOf with the line's kind (PS-01b)", () => {
  const retry = commandOf('retry', { quest: questId(3) }, at(9));
  const applied = (id: string, data: Record<string, unknown>, minute = 10, day?: string) =>
    lineOf('command.applied', { command_id: id, ...data }, at(minute, day));
  const gone = '01JCFB7Q2R8S4T6V9W3X5Y1Z0A';
  const input = (events: Event[]) => ({ quests: [], verdicts: [], events, commands: [retry] });

  it('takes the kind from the line, and the quest and time from inbox/done when the file is there', () => {
    expect(ownerCommandsOf(input([applied(retry.id, { kind: 'retry' })]), ON_THE_DAY)).toEqual([
      { id: retry.id, kind: 'retry', quest: questId(3), ts: at(9) },
    ]);
  });

  it('counts a command whose file left inbox/done by its line alone, on no quest', () => {
    expect(ownerCommandsOf(input([applied(gone, { kind: 'answer' })]), ON_THE_DAY)).toEqual([
      { id: gone, kind: 'answer', quest: null, ts: at(10) },
    ]);
  });

  it('leaves out a kind the owner does not step in with, an older line without its file, a repeat and other days', () => {
    const events = [
      applied(gone, { kind: 'create_quest' }),
      applied('01JCFB7Q2R8S4T6V9W3X5Y1Z0B', {}),
      applied(retry.id, {}),
      applied(retry.id, { kind: 'retry' }),
      applied('01JCFB7Q2R8S4T6V9W3X5Y1Z0C', { kind: 'cancel' }, 0, NEXT_DAY),
    ];
    expect(ownerCommandsOf(input(events), ON_THE_DAY).map(({ id }) => id)).toEqual([retry.id]);
  });

  it('leaves out the edits of the Chancellor’s triage, by its line or by its file (PS-03b)', () => {
    const edit = { ...commandOf('retry', { quest: questId(4) }, at(9)), source: 'chancellor' as const };
    const events = [applied(gone, { kind: 'edit_quest', source: 'chancellor' }), applied(edit.id, {})];
    expect(ownerCommandsOf({ ...input(events), commands: [edit] }, ON_THE_DAY)).toEqual([]);
  });
});
