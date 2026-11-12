import { describe, expect, it } from 'vitest';

import { at, lineOf, questId, questOf } from './__fixtures__/ledger.ts';
import { firstEditsOf, graphQueriesOf, medianOf, promptSizesOf, sessionRolesOf } from './session-counts.ts';
import type { Event } from '../schema/event/event.ts';

const NEXT_DAY = '2026-11-09';
const ON_THE_DAY = { since: '2026-11-08', until: '2026-11-08' } as const;

/** A line a session's hook wrote; `quest` null: a line that names none. */
const heard = (line: Event, session?: string, quest: string | null = questId(1)): Event => ({
  ...line,
  ...(session === undefined ? {} : { session }),
  ...(quest === null ? {} : { quest: quest as Event['quest'] }),
});

const tool = (session: string | undefined, data: Record<string, unknown>, minute = 3, day?: string): Event =>
  heard(lineOf('agent.tool', data, at(minute, day)), session);

// Quest 1: assignee sessions a1 and a2, judge v1; quest 2: an entry with no session.
const QUESTS = [
  questOf(1, [
    { n: 1, start: 1, end: 9, session: 'a1' },
    { n: 1, role: 'verifier', start: 10, end: 12, session: 'v1' },
    { n: 2, start: 13, end: 20, session: 'a2' },
  ]),
  questOf(2, [{ n: 1, start: 1, end: 2 }]),
];

describe('medianOf', () => {
  it('takes the middle, rounding the mean of the two middles', () => {
    expect(medianOf([])).toBeNull();
    expect(medianOf([9, 1, 5])).toBe(5);
    expect(medianOf([4, 1, 2, 7])).toBe(3);
    expect(medianOf([1, 2])).toBe(2);
  });
});

describe('sessionRolesOf', () => {
  it('names the role of each session the attempt logs name', () => {
    expect([...sessionRolesOf(QUESTS)]).toEqual([
      ['a1', 'assignee'],
      ['v1', 'verifier'],
      ['a2', 'assignee'],
    ]);
  });
});

describe('graphQueriesOf (PS-21)', () => {
  it('counts the graph commands by command and the sessions that asked', () => {
    const events = [
      tool('a1', { tool: 'bash', command: 'graphify query "FOCUS_MAX"' }),
      tool('a1', { tool: 'bash', command: 'graphify affected FOCUS_MAX' }),
      tool('v1', { tool: 'bash', command: '  graphify affected AreaCard' }),
      // Counted, but no session's.
      tool(undefined, { tool: 'bash', command: 'graphify explain AreaCard' }),
      // Not queries: another command, no command, another type, another day.
      tool('a1', { tool: 'bash', command: 'graphify update .' }),
      tool('a1', { tool: 'read', path: 'src/a.ts' }),
      heard(lineOf('agent.tool.blocked', { tool: 'bash', reason: 'x' }, at(3)), 'a1'),
      tool('a1', { tool: 'bash', command: 'graphify query x' }, 3, NEXT_DAY),
    ];
    expect(graphQueriesOf(events, ON_THE_DAY)).toEqual({
      total: 4,
      sessions: 2,
      by_command: [
        { command: 'graphify query', count: 1 },
        { command: 'graphify path', count: 0 },
        { command: 'graphify explain', count: 1 },
        { command: 'graphify affected', count: 2 },
      ],
    });
    expect(graphQueriesOf(events, {}).total).toBe(5);
  });
});

describe('firstEditsOf (PS-21)', () => {
  it('counts the calls of each assignee session before its first edit', () => {
    const events = [
      tool('a1', { tool: 'read', path: 'a.ts' }, 2),
      tool('a1', { tool: 'search', path: 'src' }, 3),
      tool('a1', { tool: 'bash', command: 'graphify query a' }, 4),
      tool('a1', { tool: 'write', path: 'a.ts' }, 5),
      tool('a1', { tool: 'read', path: 'b.ts' }, 6),
      // a2 edits at once; its line names no quest.
      heard(lineOf('agent.tool', { tool: 'write', path: 'b.ts' }, at(14)), 'a2', null),
      heard(lineOf('agent.tool', { tool: 'bash', command: 'pnpm test' }, at(15)), 'a2', null),
      // The judge, a line with no session, a session the logs do not name, another day: not counted.
      tool('v1', { tool: 'read', path: 'a.ts' }, 11),
      tool(undefined, { tool: 'write', path: 'a.ts' }, 7),
      tool('x9', { tool: 'write', path: 'a.ts' }, 7),
      tool('a1', { tool: 'write', path: 'c.ts' }, 7, NEXT_DAY),
      lineOf('quest.claimed', {}, at(1)),
    ];
    expect(firstEditsOf(events, QUESTS, ON_THE_DAY)).toEqual({
      sessions: [
        { session: 'a1', quest: questId(1), calls: 5, before: 3, edited: true },
        { session: 'a2', quest: null, calls: 2, before: 0, edited: true },
      ],
      edited: 2,
      median_before: 2,
      median_share_pct: 30,
      share_pct: 43,
    });
  });

  it('counts a session that never edited, and gives no share without an edit', () => {
    const events = [tool('a1', { tool: 'read', path: 'a.ts' }), tool('a1', { tool: 'search', path: '.' })];
    expect(firstEditsOf(events, QUESTS, {})).toEqual({
      sessions: [{ session: 'a1', quest: questId(1), calls: 2, before: 2, edited: false }],
      edited: 0,
      median_before: null,
      median_share_pct: null,
      share_pct: null,
    });
  });
});

describe('promptSizesOf (PS-21, from the load trace of PS-01b)', () => {
  const trace = (blocks: readonly [string, string, number][]) => ({
    scriptures: [],
    skills: [],
    blocks: blocks.map(([part, id, chars]) => ({ part, id, chars })),
  });
  const opening = (
    type: string,
    session: string | undefined,
    status: string,
    blocks: readonly [string, string, number][] | undefined,
    minute = 3,
    day?: string,
  ): Event =>
    heard(
      lineOf(
        type,
        { quest: { status }, ...(blocks === undefined ? {} : { load_trace: trace(blocks) }) },
        at(minute, day),
      ),
      session,
    );

  it('sizes each block and the whole prompt per role', () => {
    const events = [
      opening('quest.started', 'a1', 'working', [
        ['system', 'role', 400],
        ['system', 'decree', 100],
        ['user', 'quest', 300],
      ]),
      opening('quest.unblocked', 'a2', 'working', [
        ['system', 'role', 600],
        ['system', 'decree', 100],
        ['user', 'answer', 50],
      ]),
      // The judge's line: by the attempt log, then by the status when the log does not name the session.
      opening('quest.started', 'v1', 'review', [
        ['system', 'role', 200],
        ['user', 'review', 900],
      ]),
      opening('quest.resumed', undefined, 'review', [['user', 'resumed', 80]]),
      opening('quest.resumed', 'z1', 'working', [['user', 'resumed', 70]]),
      // No trace, not an opening line, another day.
      opening('quest.started', 'a1', 'working', undefined),
      opening('quest.claimed', 'a1', 'working', [['user', 'quest', 1]]),
      opening('quest.started', 'a1', 'working', [['user', 'quest', 5]], 3, NEXT_DAY),
    ];
    const sizes = promptSizesOf(events, QUESTS, ON_THE_DAY);
    expect(sizes.roles).toEqual([
      { role: 'assignee', sessions: 3, median_chars: 750, max_chars: 800 },
      { role: 'verifier', sessions: 2, median_chars: 590, max_chars: 1100 },
    ]);
    expect(
      sizes.blocks.map(({ role, part, block, sessions, median_chars, max_chars }) =>
        [role, part, block, sessions, median_chars, max_chars].join(' '),
      ),
    ).toEqual([
      'assignee system role 2 500 600',
      'assignee system decree 2 100 100',
      'assignee user quest 1 300 300',
      'assignee user resumed 1 70 70',
      'assignee user answer 1 50 50',
      'verifier system role 1 200 200',
      'verifier user review 1 900 900',
      'verifier user resumed 1 80 80',
    ]);
  });

  it('leaves out a role with no opening line, and orders equal medians by block', () => {
    const events = [
      opening('quest.started', 'v1', 'review', [
        ['system', 'role', 10],
        ['system', 'class', 10],
      ]),
    ];
    const sizes = promptSizesOf(events, QUESTS, {});
    expect(sizes.roles.map(({ role }) => role)).toEqual(['verifier']);
    expect(sizes.blocks.map(({ block }) => block)).toEqual(['class', 'role']);
  });
});
