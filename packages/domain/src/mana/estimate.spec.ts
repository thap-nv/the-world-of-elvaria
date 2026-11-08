import { describe, expect, it } from 'vitest';

import { estimatedReadings } from './estimate.ts';
import type { Instant } from '../core/clock.ts';
import type { CharacterId, TribeId } from '../core/ids.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { EstimateSource } from './estimate.ts';
import type { ManaReading } from './reading.ts';

const CLAUDE = 'claude' as TribeId;
const GEMINI = 'gemini' as TribeId;
const NOW_ISO = '2026-11-08T12:00:00Z';
const NOW = Date.parse(NOW_ISO) as Instant;
/** An ISO time `hours` before NOW. */
const ago = (hours: number): string => new Date(NOW - hours * 3_600_000).toISOString();

const run = (character: string, start: number, end: number | undefined, tokens?: number): Attempt => ({
  n: 1,
  character: character as CharacterId,
  role: 'assignee',
  started_at: ago(start),
  ...(end === undefined ? {} : { ended_at: ago(end) }),
  ...(tokens === undefined ? {} : { tokens }),
  run_dir: '.runs/q-1',
});

const source = (attempts: readonly Attempt[], more: Partial<EstimateSource> = {}): EstimateSource => ({
  tribes: [
    { id: CLAUDE, budget: { tokens_5h: 1000, tokens_7d: 10_000 } },
    { id: GEMINI, pools: { gemini_models: { enabled: true }, claude_gpt_models: { enabled: true } } },
  ],
  characters: [
    { id: 'thorn' as CharacterId, tribe: CLAUDE, model: 'claude-opus-5-5' },
    { id: 'quill' as CharacterId, tribe: GEMINI, model: 'gemini-4-argon-medium' },
  ],
  quests: [{ attempt_log: [...attempts] }],
  limits: { [CLAUDE]: { mana_source: 'usage' }, [GEMINI]: { mana_source: 'usage' } },
  readings: [],
  ...more,
});

const used = (readings: readonly ManaReading[]) => readings.map((r) => [r.pool, r.window, r.used_pct]);

describe('estimatedReadings', () => {
  it("sums the tokens of the sessions that ended in each window against the tribe's budget", () => {
    const attempts = [
      run('thorn', 3, 2, 250),
      run('thorn', 30, 29, 3000),
      run('thorn', 1, undefined),
      run('thorn', 2, 1),
    ];
    const readings = estimatedReadings(source(attempts), NOW, NOW_ISO);
    expect(used(readings)).toEqual([
      ['claude', 'five_hour', 25],
      ['claude', 'weekly', 32.5],
    ]);
    expect(readings[0]).toMatchObject({
      source: 'estimate',
      exhausted: false,
      resets_at: null,
      observed_at: NOW_ISO,
    });
  });

  it('caps at 100 % and never calls a pool spent: only the account says that', () => {
    const readings = estimatedReadings(source([run('thorn', 2, 1, 5000)]), NOW, NOW_ISO);
    expect(readings[0]).toMatchObject({ used_pct: 100, exhausted: false });
  });

  it('measures minutes for a tribe without usage, the running session included', () => {
    const gemini = {
      id: GEMINI,
      pools: { gemini_models: { enabled: true } },
      budget: { minutes_5h: 120 },
    };
    const readings = estimatedReadings(
      source([run('quill', 6, 4), run('quill', 1, undefined), run('thorn', 1, 0, 10)], {
        tribes: [gemini],
        limits: { [GEMINI]: { mana_source: 'elapsed_time' } },
      }),
      NOW,
      NOW_ISO,
    );
    expect(used(readings)).toEqual([['gemini_models', 'five_hour', 100]]);
  });

  it('leaves alone a window the account gave a current figure for, a tribe with no budget or no runner', () => {
    const reported: ManaReading = {
      tribe: CLAUDE,
      pool: 'claude',
      window: 'five_hour',
      used_pct: 40,
      resets_at: null,
      source: 'rate_limits',
      observed_at: NOW_ISO,
      exhausted: false,
    };
    const old = { ...reported, window: 'weekly' as const, resets_at: ago(1) };
    const readings = estimatedReadings(source([], { readings: [reported, old] }), NOW, NOW_ISO);
    expect(used(readings)).toEqual([['claude', 'weekly', 0]]);
    expect(estimatedReadings(source([], { limits: {} }), NOW, NOW_ISO)).toEqual([]);
  });

  it('charges no script run, nor a session of an unknown character; an unreadable time counts as now', () => {
    const script = { ...run('thorn', 2, 1, 500), character: null };
    const stranger = run('nobody', 2, 1, 500);
    const odd = { ...run('thorn', 2, 1, 500), ended_at: 'later', started_at: 'sooner' };
    expect(used(estimatedReadings(source([script, stranger, odd]), NOW, NOW_ISO))).toEqual([
      ['claude', 'five_hour', 50],
      ['claude', 'weekly', 5],
    ]);
  });
});
