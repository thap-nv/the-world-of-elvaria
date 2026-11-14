// The PS-21 parts of `elvaria metrics`: the graph's queries, the calls before a first edit and the prompt's size, from
// lines as the hook and the Steward write them.
import { EVENT_VERSION, EventSchema, metricsOf, questViewOf } from '@elvaria/domain';
import type { Event } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { QUEST_ID, questFixture } from '../../test/quest.ts';
import { metricsSections } from './view.ts';
import { firstEditsLine, graphLine, promptSection } from './view-sessions.ts';

const t = translator('en');
const DAY = '2026-11-06';
const ASSIGNEE = 's-assignee-1';
const JUDGE = 's-verifier-1';

const QUEST = questFixture('review', QUEST_ID, {
  assignee: 'thorn',
  verifier: 'vesper',
  attempts: 1,
  attempt_log: [
    {
      n: 1,
      character: 'thorn',
      role: 'assignee',
      started_at: `${DAY}T09:00:00+07:00`,
      session_id: ASSIGNEE,
      run_dir: `.runs/${QUEST_ID}-1`,
    },
    {
      n: 1,
      character: 'vesper',
      role: 'verifier',
      started_at: `${DAY}T10:00:00+07:00`,
      session_id: JUDGE,
      run_dir: `.runs/${QUEST_ID}-1/verify`,
    },
  ],
});

let counter = 0;
const line = (type: string, data: Record<string, unknown>, session: string): Event => {
  counter += 1;
  return EventSchema.parse({
    v: EVENT_VERSION,
    id: `01JC${String(counter).padStart(22, '0')}`,
    ts: `${DAY}T09:30:00+07:00`,
    type,
    actor: { kind: 'steward' },
    quest: QUEST_ID,
    session,
    data,
  });
};

const opening = (session: string, blocks: readonly [string, string, number][]): Event =>
  line(
    'quest.started',
    {
      quest: questViewOf(QUEST),
      load_trace: {
        scriptures: [],
        skills: [],
        blocks: blocks.map(([part, id, chars]) => ({ part, id, chars })),
      },
    },
    session,
  );

const EVENTS = [
  opening(ASSIGNEE, [
    ['system', 'role', 400],
    ['user', 'quest', 300],
  ]),
  opening(JUDGE, [['user', 'review', 900]]),
  line('agent.tool', { tool: 'search', path: 'src' }, ASSIGNEE),
  line('agent.tool', { tool: 'bash', command: 'graphify query "FOCUS_MAX"' }, ASSIGNEE),
  line('agent.tool', { tool: 'write', path: 'src/a.ts' }, ASSIGNEE),
  line('agent.tool', { tool: 'bash', command: 'graphify affected FOCUS_MAX' }, JUDGE),
];

const METRICS = metricsOf({ quests: [QUEST], verdicts: [], events: EVENTS, commands: [] });
const EMPTY = metricsOf({ quests: [], verdicts: [], events: [], commands: [] });

describe('the metrics of PS-21', () => {
  it('counts the graph queries by command', () => {
    expect(graphLine(t, METRICS)).toBe(
      'Code graph queries: 2 in 2 sessions (query 1, path 0, explain 0, affected 1).',
    );
  });

  it('tells how much an assignee looked around before its first edit, and says so when nobody edited', () => {
    expect(firstEditsLine(t, METRICS)).toBe(
      'Assignee sessions: 1, 1 edited a file; before the first edit: 2 tool calls at the median, 67 % of all their calls (67 % at the median).',
    );
    expect(firstEditsLine(t, EMPTY)).toBe(
      'Assignee sessions: 0, 0 edited a file; before the first edit: — tool calls at the median, — of all their calls (— at the median).',
    );
  });

  it('sizes the whole prompt, then each block, per role', () => {
    const section = promptSection(t, METRICS);
    expect(section.title).toBe('Prompt size by role and block (characters)');
    expect(section.table?.header).toEqual(['Role', 'Part', 'Block', 'Sessions', 'Median', 'Max']);
    expect(section.table?.rows).toEqual([
      ['Assignee', '—', 'whole prompt', '1', '700', '700'],
      ['Assignee', 'system', 'role', '1', '400', '400'],
      ['Assignee', 'user', 'quest', '1', '300', '300'],
      ['Verifier', '—', 'whole prompt', '1', '900', '900'],
      ['Verifier', 'user', 'review', '1', '900', '900'],
    ]);
    expect(promptSection(t, EMPTY).lines).toEqual(['None.']);
  });

  it('prints the new lines in the summary, the table before the limits, and the limits they bring', () => {
    const sections = metricsSections(t, METRICS);
    const summary = sections[0]?.lines ?? [];
    // Side by side in the summary; lines of later tasks may follow them (PS-05: out of scope).
    const at = summary.indexOf(graphLine(t, METRICS));
    expect(summary.slice(at, at + 2)).toEqual([graphLine(t, METRICS), firstEditsLine(t, METRICS)]);
    const titles = sections.map(({ title }) => title);
    expect(titles.slice(-2)).toEqual(['Prompt size by role and block (characters)', 'Known limits']);
    const limits = sections.at(-1)?.lines.join('\n') ?? '';
    expect(limits).toContain('Lines written before PS-21 still count Glob, Grep and LS');
    expect(limits).toContain(
      'Calls before the first edit count the agent.tool lines of each assignee session',
    );
    expect(limits).toContain('Prompt sizes are in characters');
  });
});
