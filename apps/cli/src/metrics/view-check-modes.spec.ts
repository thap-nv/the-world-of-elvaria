import { metricsOf } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { OTHER_QUEST_ID, QUEST_ID, questFixture } from '../../test/quest.ts';
import { checkLog } from './__fixtures__/check-log.ts';
import { metricsSections } from './view.ts';
import { checkModesSection } from './view-check-modes.ts';

describe('checks by mode in the ledger', () => {
  it('prints all four baselines through the shared report sections', () => {
    const events = checkLog(
      questFixture('working', QUEST_ID, { assignee: 'thorn' }),
      questFixture('working', OTHER_QUEST_ID, { assignee: 'thorn' }),
    );
    const metrics = metricsOf({ quests: [], verdicts: [], commands: [], events });
    const section = metricsSections(translator('en'), metrics).find(
      ({ title }) => title === 'Checks by mode',
    );
    expect(section?.lines).toEqual(
      expect.arrayContaining([
        'full: 1 runs; median 10.00, p90 10.00 minutes.',
        'narrow: 1 runs; median 2.00, p90 2.00 minutes.',
        'patrol (check durations): 3 runs; median 1.00, p90 1.00 minutes.',
        '2026-11-06: 4 full runs.',
        'Machine check minutes for 1 merged quests: median 9.00, total 9.00.',
        'do-an/test: red from 2026-11-06T08:20:00+07:00 to 2026-11-06T08:30:00+07:00; 10.00 minutes.',
        'do-an/test: red from 2026-11-06T08:40:00+07:00 to still red; — minutes.',
        'First submit to main: 1 quests; median 20.00, p90 20.00 minutes.',
        'do-an: peak working 2, review held by a judge 2.',
      ]),
    );
    expect(checkModesSection(translator('vi'), metrics).title).toBe('Kiểm theo chế độ');
  });

  it('says there are no check runs in an empty log', () => {
    const metrics = metricsOf({ quests: [], verdicts: [], commands: [], events: [] });
    expect(checkModesSection(translator('vi'), metrics)).toEqual({
      title: 'Kiểm theo chế độ',
      lines: ['Chưa có lượt kiểm.'],
    });
    expect(checkModesSection(translator('en'), metrics).lines).toEqual(['No check runs yet.']);
  });
});
