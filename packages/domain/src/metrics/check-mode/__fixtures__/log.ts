import { questViewOf } from '../../../world/quest-view.ts';
import { merged, ran } from '../../../patrol/__fixtures__/patrol-log.ts';
import { at, lineOf, questOf } from '../../__fixtures__/ledger.ts';
import type { QuestStatus } from '../../../schema/quest/shared.ts';

export const FIRST = questOf(1, [], { territory: 'elvaria' });
export const SECOND = questOf(2, [], { territory: 'elvaria' });

export const move = (minute: number, status: QuestStatus, quest = FIRST, judge = false) =>
  lineOf(
    status === 'review' && !judge ? 'quest.submitted' : 'quest.started',
    {
      quest: { ...questViewOf(quest), status, verifier: judge ? 'vesper' : null },
    },
    at(minute),
    quest.id,
  );

export const check = (type: string, minute: number, data: Record<string, unknown> = {}, attempt = 1) => ({
  ...lineOf(type, data, at(minute), FIRST.id),
  attempt,
});

export const LOG = [
  move(0, 'working'),
  move(1, 'working', SECOND),
  move(5, 'review'),
  check('check.start', 5),
  check('check.end', 15, { outcome: 'pass', checks: [{ id: 'test', pass: true, duration_ms: 480000 }] }),
  move(15, 'review', FIRST, true),
  move(16, 'review', SECOND, true),
  check('check.start', 16, { mode: 'narrow' }),
  check('check.end', 18, {
    mode: 'narrow',
    outcome: 'fail',
    checks: [{ id: 'test', pass: false, duration_ms: 60000 }],
  }),
  check('check.start', 19),
  check('check.end', 20, { outcome: 'error', checks: [] }),
  ran(at(20), [{ id: 'test', pass: false }]),
  move(21, 'done'),
  merged(at(25), FIRST.id),
  ran(at(30), [{ id: 'test', pass: true }]),
];
