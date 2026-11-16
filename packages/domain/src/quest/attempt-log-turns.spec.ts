import { expect, it } from 'vitest';

import { Q1, at, quest, workingBy } from '../dispatch/__fixtures__/snapshot.ts';
import { closeRun } from './attempt-log.ts';

it('records reported turns including zero, leaving old measurements absent or unchanged', () => {
  const { attempt_log: log } = workingBy(quest(Q1), 'thorn');
  for (const turns of [0, 12]) {
    expect(closeRun(log, 'assignee', { at: at(20), outcome: 'submitted', run: { turns } })[0]).toMatchObject({
      turns,
      ended_at: at(20),
    });
  }
  expect(closeRun(log, 'assignee', { at: at(20), outcome: 'crash', run: {} })[0]).not.toHaveProperty('turns');
  const measured = log.map((entry) => ({ ...entry, turns: 7 }));
  expect(closeRun(measured, 'assignee', { at: at(20), outcome: 'crash', run: {} })[0]?.turns).toBe(7);
  expect(closeRun(log, 'verifier', { at: at(20), outcome: 'submitted', run: { turns: 9 } })).toEqual(log);
});
