import { EVENT_VERSION, EventSchema, questViewOf } from '@elvaria/domain';
import type { Quest } from '@elvaria/domain';

const QUEST_ID = 'q_20261106_7k3m2a';

let serial = 0;
const at = (minute: number) => `2026-11-06T08:${String(minute).padStart(2, '0')}:00+07:00`;
const line = (type: string, minute: number, data: object) => {
  serial += 1;
  return EventSchema.parse({
    v: EVENT_VERSION,
    id: `01JC${String(serial).padStart(22, '0')}`,
    ts: at(minute),
    type,
    actor: { kind: 'steward' },
    quest: QUEST_ID,
    attempt: 1,
    data,
  });
};
const view = (status: 'working' | 'review', quest: Quest, judge = false) => ({
  quest: { ...questViewOf(quest), status, verifier: judge ? 'vesper' : null },
});
const patrol = (minute: number, pass: boolean) =>
  line('patrol.ran', minute, {
    territory: 'do-an',
    head: 'a'.repeat(40),
    trigger: 'schedule',
    setup: null,
    scans: [],
    checks: [
      {
        id: 'test',
        pass,
        duration_ms: 60000,
        timed_out: false,
        environment: false,
        log_path: '.runs/test.log',
      },
    ],
  });

export const checkLog = (first: Quest, second: Quest) => [
  line('quest.started', 0, view('working', first)),
  line('quest.started', 1, view('working', second)),
  line('quest.submitted', 5, view('review', first)),
  line('check.start', 5, {}),
  line('check.end', 15, { outcome: 'pass', checks: [{ id: 'test', pass: true, duration_ms: 480000 }] }),
  line('check.start', 16, { mode: 'narrow' }),
  line('check.end', 18, {
    mode: 'narrow',
    outcome: 'pass',
    checks: [{ id: 'test', pass: true, duration_ms: 60000 }],
  }),
  line('quest.started', 18, view('review', first, true)),
  line('quest.started', 19, view('review', second, true)),
  patrol(20, false),
  line('delivery.merged', 25, {
    quest: QUEST_ID,
    territory: 'do-an',
    branch: `quest/${QUEST_ID}`,
    head: 'a'.repeat(40),
    pr: { number: 1, url: 'https://github.com/o/r/pull/1' },
    merge_sha: 'b'.repeat(40),
    method: 'merge',
    sealed: true,
    branch_deleted: true,
  }),
  patrol(30, true),
  patrol(40, false),
];
