// The PS-22 parts of `elvaria metrics`: memos by kind, and the objections each first judge's verdicts drew; (PS-22b) the
// amendments.
import { EVENT_VERSION, EventSchema, VerdictSchema, metricsOf } from '@elvaria/domain';
import type { Event } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { QUEST_ID } from '../../test/quest.ts';
import { metricsSections } from './view.ts';
import { amendmentsSection, memosSection, objectionsSection } from './view-memos.ts';

const t = translator('en');
const AT = '2026-11-06T09:30:00+07:00';

let counter = 0;
const line = (type: string, data: Record<string, unknown>): Event => {
  counter += 1;
  return EventSchema.parse({
    v: EVENT_VERSION,
    id: `01JC${String(counter).padStart(22, '0')}`,
    ts: AT,
    type,
    actor: { kind: 'steward' },
    quest: QUEST_ID,
    data,
  });
};

const EVENTS = [
  line('memo.filed', { memo: 'm_20261106_aaaaaa', kind: 'objection', from: 'thorn' }),
  line('memo.routed', { memo: 'm_20261106_aaaaaa', route: 'judge' }),
  line('memo.filed', { memo: 'm_20261106_bbbbbb', kind: 'objection', from: 'thorn' }),
  line('memo.routed', { memo: 'm_20261106_bbbbbb', route: 'owner', refusal: 'final_verdict' }),
];

/** sable's pass on run 2, which sustained the objection to vesper's fail on run 1. */
const SUSTAINED = VerdictSchema.parse({
  version: 1,
  id: `${QUEST_ID}-2`,
  quest_id: QUEST_ID,
  attempt: 2,
  verifier_id: 'sable',
  ritual: 'build_review',
  checks: [],
  result: 'pass',
  notes: 'The test the first verdict asked for is there; the work meets the goal.',
  objection: { memo: 'm_20261106_aaaaaa', verdict: `${QUEST_ID}-1`, judge: 'vesper' },
  by_human: false,
  session_id: 's-2',
  created_at: AT,
});

const METRICS = metricsOf({ quests: [], verdicts: [SUSTAINED], events: EVENTS, commands: [] });
const EMPTY = metricsOf({ quests: [], verdicts: [], events: [], commands: [] });

describe('the metrics of PS-22', () => {
  it('counts the memos by kind, with those sent to the owner', () => {
    const section = memosSection(t, METRICS);
    expect(section.title).toBe('Memos by kind');
    expect(section.table).toEqual({
      // PS-03b: who decided them, the owner or the Chancellor's triage.
      header: ['Kind', 'Filed', 'To the owner', 'Decided by you', 'By the triage'],
      rows: [['objection', '2', '1', '0', '0']],
    });
    expect(memosSection(t, EMPTY).lines).toEqual(['None.']);
  });

  it("counts each first judge's verdicts a second judge read, and those it overturned", () => {
    const section = objectionsSection(t, METRICS);
    expect(section.title).toBe('Objections by first judge');
    expect(section.table).toEqual({
      header: ['Verifier', 'Read by a second judge', 'Overturned'],
      rows: [['vesper', '1', '1']],
    });
    expect(objectionsSection(t, EMPTY).lines).toEqual(['None.']);
  });

  it('tells what became of the amendments (PS-22b)', () => {
    const amendments = metricsOf({
      quests: [],
      verdicts: [],
      events: [
        line('memo.routed', { memo: 'm_20261106_cccccc', route: 'author' }),
        line('memo.closed', { memo: 'm_20261106_cccccc', decision: 'rejected' }),
      ],
      commands: [],
    });
    expect(amendmentsSection(t, amendments).table).toEqual({
      header: ['Filed', 'Accepted', 'Rejected', 'To the owner', 'Returned after a rejection'],
      rows: [['1', '0', '1', '0', '0']],
    });
    expect(amendmentsSection(t, EMPTY).lines).toEqual(['None.']);
  });

  it('prints them after the quests, before the reads', () => {
    const titles = metricsSections(t, METRICS).map(({ title }) => title);
    const memos = titles.indexOf('Memos by kind');
    expect(titles.slice(memos - 1, memos + 4)).toEqual([
      'By quest',
      'Memos by kind',
      'Objections by first judge',
      // PS-22b.
      'Amendments to quest descriptions',
      'Files a session read again (at most 10 rows, the most read first)',
    ]);
  });
});
