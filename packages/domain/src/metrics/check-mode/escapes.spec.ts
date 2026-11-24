import { describe, expect, it } from 'vitest';

import { metricsOf } from '../metrics-of.ts';
import { checkEscapesOf, narrowEscapeAlertsOf } from './escapes.ts';
import {
  ESCAPE_LOG,
  ESCAPE_QUESTS,
  ESCAPE_VERDICTS,
  TERRITORIES_WITH_ESCAPES,
} from './__fixtures__/escapes.ts';
import { conclusion, mergesOf, territoryOf } from './__fixtures__/escapes.ts';
import { at, verdictOf } from '../__fixtures__/ledger.ts';
import { noticeItems } from '../../world/attention-notices.ts';
import { worldStateOf } from '../../world/world-state.ts';
import { KINGDOM } from '../../world/__fixtures__/examples.ts';

describe('escaped narrow checks (CM-09b)', () => {
  it('reads the ledger and digest from the same sample log', () => {
    const metrics = metricsOf({
      events: ESCAPE_LOG,
      quests: ESCAPE_QUESTS,
      verdicts: ESCAPE_VERDICTS,
      commands: [],
    });
    expect(metrics.check_modes.escapes).toEqual([
      { territory: 'alpha', merges: 12, own_change: 2, combination: 0, late: 1 },
      { territory: 'beta', merges: 12, own_change: 0, combination: 1, late: 0 },
      { territory: 'gamma', merges: 12, own_change: 1, combination: 1, late: 0 },
    ]);
    expect(metrics.check_modes.has_attributions).toBe(true);
    const narrow_escapes = narrowEscapeAlertsOf(ESCAPE_LOG, TERRITORIES_WITH_ESCAPES);
    expect(narrow_escapes).toEqual([{ territory: 'alpha', merges: 12, escapes: 2 }]);
    const state = worldStateOf({
      kingdom: KINGDOM,
      territories: [],
      characters: [],
      quests: [],
      campaigns: [],
    });
    expect(noticeItems(state, { narrow_escapes })).toEqual([
      {
        kind: 'narrow_escapes',
        group: 'can_wait',
        advice: 'consider_full',
        command: ['metrics'],
        territory: 'alpha',
        merges: 12,
        escapes: 2,
      },
    ]);
  });

  it('uses event and verdict dates for the ledger window, ignoring verdicts with no quest', () => {
    expect(checkEscapesOf(ESCAPE_LOG, { since: '2026-11-09' }, ESCAPE_QUESTS, ESCAPE_VERDICTS)).toEqual([]);
    expect(checkEscapesOf([], {}, [], [verdictOf(9, 1, 'fail', { minute: 32, late: true })])).toEqual([]);
    expect(checkEscapesOf([], {}, ESCAPE_QUESTS, ESCAPE_VERDICTS)).toEqual([
      { territory: 'alpha', merges: 0, own_change: 0, combination: 0, late: 1 },
    ]);
  });

  it('requires ten merges and strictly more than one in ten; absent policy means full', () => {
    const errors = [conclusion('alpha', 'own_change', 1), conclusion('alpha', 'combination', 2)];
    expect(narrowEscapeAlertsOf([...mergesOf('alpha', 9), ...errors], [territoryOf('alpha')])).toEqual([]);
    expect(narrowEscapeAlertsOf([...mergesOf('alpha', 10), errors[0]!], [territoryOf('alpha')])).toEqual([]);
    expect(narrowEscapeAlertsOf([...mergesOf('alpha', 10), ...errors], [territoryOf('alpha')])).toEqual([
      { territory: 'alpha', merges: 10, escapes: 2 },
    ]);
    expect(narrowEscapeAlertsOf(ESCAPE_LOG, [{ ...territoryOf('alpha'), check_policy: undefined }])).toEqual(
      [],
    );
  });

  it('keeps only the latest twenty merge lines, matching culprit and territory', () => {
    const events = [
      ...mergesOf('alpha', 22),
      conclusion('alpha', 'own_change', 1),
      conclusion('alpha', 'combination', 2),
      conclusion('alpha', 'own_change'),
      conclusion('alpha', 'own_change', 99),
      conclusion('beta', 'own_change', 3),
      conclusion('alpha', 'flaky', 3),
      conclusion('alpha', 'own_change', 3),
      conclusion('alpha', 'combination', 4),
    ];
    expect(narrowEscapeAlertsOf(events, [territoryOf('alpha')])).toEqual([]);
    // Earlier timestamps do not undo log order or narrow the rolling history.
    events.push({ ...conclusion('alpha', 'combination', 5), ts: at(0, '2026-11-01') });
    expect(narrowEscapeAlertsOf(events, [territoryOf('alpha')])).toEqual([
      { territory: 'alpha', merges: 20, escapes: 3 },
    ]);
  });
});
