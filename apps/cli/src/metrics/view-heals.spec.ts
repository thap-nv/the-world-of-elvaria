import { describe, expect, it } from 'vitest';
import { metricsOf } from '@elvaria/domain';
import type { TribeId } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';

import { healsSection } from './view-heals.ts';
import { metricsSections } from './view.ts';

const t = translator('en');
const empty = metricsOf({ quests: [], verdicts: [], events: [], commands: [] });

describe('healing ledger section', () => {
  it('says when the window has no heal, in both languages', () => {
    expect(healsSection(t, empty)).toEqual({ title: 'Healing ledger', lines: ['No heals in this window.'] });
    expect(healsSection(translator('vi'), empty)).toEqual({
      title: 'Sổ đo lần chữa',
      lines: ['Không có lần chữa trong khoảng này.'],
    });
  });

  it('prints character counts, healer outcomes, medians and verdict and owner lines', () => {
    const section = healsSection(t, {
      ...empty,
      heals: {
        total: 3,
        by_assignee: [{ character: null, tribe: null, heals: 3 }],
        by_healer: [
          { kind: 'self', tribe: 'claude' as TribeId, heals: 1, healed: 1, rate: 1, median_tokens: 300 },
          { kind: 'healer', tribe: 'codex' as TribeId, heals: 2, healed: 1, rate: 0.5, median_tokens: 200 },
          { kind: 'pending', tribe: null, heals: 1, healed: 0, rate: null, median_tokens: null },
        ],
        verdicts: {
          healed: { decided: 2, passed: 1, rate: 0.5 },
          ordinary: { decided: 1, passed: 1, rate: 1 },
        },
        owner_submits: 1,
      },
    });
    expect(section.table?.rows).toEqual([
      ['Assignee', '—', '—', '3', '—', '—', '—'],
      ['Self', '—', 'claude', '1', '1', '100 %', '300'],
      ['Healer', '—', 'codex', '2', '1', '50 %', '200'],
      ['Pending', '—', '—', '1', '0', '—', '—'],
    ]);
    expect(section.lines).toEqual([
      'Target: at least 70 % healed after 10 heals; median below 80000 tokens per session.',
      'Runs with a heal: verdict pass 1/2 (50 %).',
      'Runs without a heal: verdict pass 1/1 (100 %).',
      'Owner submit after a refused commit: 1.',
    ]);
  });

  it('comes directly after disruptions and before sealed quests', () => {
    const titles = metricsSections(t, empty, new Map(), { title: 'disruptions', lines: [] }).map(
      ({ title }) => title,
    );
    const i = titles.indexOf('Healing ledger');
    expect(titles.slice(i - 1, i + 2)).toEqual(['disruptions', 'Healing ledger', 'Sealed quests']);
  });
});
