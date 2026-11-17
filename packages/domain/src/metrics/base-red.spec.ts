// The metrics' "base red after a merge" (PS-26): each check the patrol found turned red inside the window, with the
// quests merged since its last green patrol; none of them: the change came from outside Elvaria.
import { describe, expect, it } from 'vitest';

import { merged, ran } from '../patrol/__fixtures__/patrol-log.ts';
import { metricsOf } from './metrics-of.ts';
import type { QuestId } from '../core/ids.ts';

const Q1 = 'q_20261116_aaaaa1' as QuestId;
const events = [
  ran('2026-11-15T06:30:00+07:00', [{ id: 'unit', pass: false }]),
  ran('2026-11-16T06:30:00+07:00', [{ id: 'unit', pass: true }]),
  merged('2026-11-16T10:00:00+07:00', Q1, false),
  ran('2026-11-17T06:30:00+07:00', [{ id: 'unit', pass: false }]),
];
const input = { quests: [], verdicts: [], commands: [], events };

describe('metricsOf: base red after a merge', () => {
  it('lists each turn inside the window with the quests merged since the last green patrol', () => {
    const rows = metricsOf(input, { since: '2026-11-17' }).base_red;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      territory: 'elvaria',
      check: 'unit',
      suspects: [{ quest: Q1, sealed: false }],
    });
    const all = metricsOf(input).base_red;
    expect(all.map(({ suspects }) => suspects.length)).toEqual([0, 1]);
  });
});
