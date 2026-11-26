import { metricsOf } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { questFixture } from '../__fixtures__/quest.ts';
import { recheckLog } from './__fixtures__/check-log.ts';
import { metricsSections } from './view.ts';
import { recheckSection } from './view-recheck.ts';
import { checkModesSection } from './view-check-modes.ts';

describe('recheck report', () => {
  it('prints all ledger numbers and push minutes in both languages', () => {
    const quest = questFixture('archived');
    const metrics = metricsOf({ quests: [], verdicts: [], commands: [], events: recheckLog(quest) });
    expect(metricsSections(translator('en'), metrics)).toContainEqual({
      title: 'Recheck ledger',
      lines: [
        'test: real runs per merged quest; median 2, max 2.',
        '2026-11-06: 2 carried checks.',
        'Carried then red: 1.',
        `do-an/test: carried then red on tree ${'b'.repeat(40)} at 2026-11-06T08:42:00+07:00.`,
      ],
    });
    expect(recheckSection(translator('vi'), metrics)).toEqual({
      title: 'Sổ đo lượt kiểm lặp',
      lines: [
        'test: lượt chạy thật mỗi quest vào main; trung vị 2, lớn nhất 2.',
        '2026-11-06: 2 check mang sang.',
        'Mang sang rồi đỏ: 1.',
        `do-an/test: mang sang rồi đỏ trên cây ${'b'.repeat(40)} lúc 2026-11-06T08:42:00+07:00.`,
      ],
    });
    expect(checkModesSection(translator('en'), metrics).lines).toContain(
      `${quest.id}: 11.00 machine check minutes, including 2.00 push minutes.`,
    );
    expect(checkModesSection(translator('vi'), metrics).lines).toContain(
      `${quest.id}: 11.00 phút máy kiểm, gồm 2.00 phút push.`,
    );
  });

  it('prints a zero regression count for an empty log', () => {
    const metrics = metricsOf({ quests: [], verdicts: [], commands: [], events: [] });
    expect(recheckSection(translator('en'), metrics).lines).toEqual(['Carried then red: 0.']);
  });
});
