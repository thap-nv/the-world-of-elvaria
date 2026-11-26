import { isEventOf, metricsOf } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { OTHER_QUEST_ID, QUEST_ID, questFixture } from '../__fixtures__/quest.ts';
import { attributedLog, checkLog, lateJudgements, recheckLog } from './__fixtures__/check-log.ts';
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
        'do-an: peak working 2, review held by a judge 2, healing 0.',
        'No check attributions yet.',
      ]),
    );
    expect(checkModesSection(translator('vi'), metrics).title).toBe('Kiểm theo chế độ');
  });

  it('prints push-only merged cost when there are no check runs', () => {
    const events = recheckLog(questFixture('archived')).filter(
      (event) => isEventOf(event, 'delivery.pushed') || isEventOf(event, 'delivery.merged'),
    );
    const metrics = metricsOf({ quests: [], verdicts: [], commands: [], events });
    const lines = checkModesSection(translator('en'), metrics).lines;
    expect(lines).toContain('q_20261106_7k3m2a: 2.00 machine check minutes, including 2.00 push minutes.');
    expect(lines).not.toContain('No check runs yet.');
  });

  it('says there are no check runs in an empty log', () => {
    const metrics = metricsOf({ quests: [], verdicts: [], commands: [], events: [] });
    expect(checkModesSection(translator('vi'), metrics)).toEqual({
      title: 'Kiểm theo chế độ',
      lines: ['Chưa có lượt kiểm.', 'Chưa có kết luận dò check.'],
    });
    expect(checkModesSection(translator('en'), metrics).lines).toEqual([
      'No check runs yet.',
      'No check attributions yet.',
    ]);
  });

  it('prints per-territory merges, conclusions and late verdicts in both languages', () => {
    const quest = questFixture('archived');
    const metrics = metricsOf({
      quests: [quest],
      events: attributedLog(quest),
      verdicts: lateJudgements(quest),
      commands: [],
    });
    expect(checkModesSection(translator('en'), metrics).lines).toContain(
      'do-an: 1 merges; own_change 1, combination 1; late verdicts 1.',
    );
    expect(checkModesSection(translator('vi'), metrics).lines).toContain(
      'do-an: 1 merge; own_change 1, combination 1; phán quyết muộn 1.',
    );
    expect(checkModesSection(translator('en'), metrics).lines).not.toContain('No check attributions yet.');
    const lines = metricsSections(translator('en'), metrics).flatMap((section) => section.lines);
    expect(lines).toContain(
      'Escaped defects: 1 (owner returns or late machine verdicts, including 1 late), 0 reported after a merge.',
    );
  });
});
