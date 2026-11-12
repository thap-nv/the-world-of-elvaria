// Step 4 of the tick when the judges a quest waits for are all held by their mana (PS-03, (d) of P1-50): the plan
// names it with the gauges that hold them; who judges, and when, is as before (ADR 0008).
import { describe, expect, it } from 'vitest';

import { KINGDOM, NOW, Q1, at, character, inReview, quest, snapshot } from './__fixtures__/snapshot.ts';
import { judgeWaitOf } from './judge-waits.ts';
import { planTick } from './plan-tick.ts';
import type { TribeId } from '../core/ids.ts';
import type { ManaReading } from '../mana/reading.ts';

const CLAUDE = 'claude' as TribeId;
const GEMINI = 'gemini' as TribeId;
const CONFIG = { cap_pct: 98, king_reserve_pct: 2, warn_margin_pct: 10 };

const reading = (tribe: TribeId, pool: string, used: number, resets: string | null): ManaReading => ({
  tribe,
  pool,
  window: 'five_hour',
  used_pct: used,
  resets_at: resets,
  source: 'rate_limits',
  observed_at: at(100),
  exhausted: used >= 100,
});

/** Thorn (Sonnet) handed Q1 in; its judges are sable (Opus, claude) and, when asked, orin (Argon, gemini). */
const thorn = character('thorn');
const sable = character('sable', { cls: 'judge', model: 'claude-opus-5-5' });
const orin = character('orin', { cls: 'judge', tribe: 'gemini' });
const review = inReview(quest(Q1), 'thorn');

describe('planTick: quests whose judges are all held by their mana', () => {
  it('names the quest with the pool and its reset when its only judge sleeps, and judges it once it wakes', () => {
    const asleep = { asleep: [{ tribe: CLAUDE, pool: 'claude' }] };
    const spent = { mana: { readings: [reading(CLAUDE, 'claude', 100, at(240))], config: CONFIG } };
    const plan = planTick(snapshot([review], [thorn, sable], { ...asleep, ...spent }), NOW);
    expect(plan).toMatchObject({ verifications: [], unjudgeable: [] });
    expect(plan.judge_waits).toEqual([
      { quest: Q1, gauges: [{ tribe: CLAUDE, pool: 'claude', resets_at: at(240) }] },
    ]);
    // The gauge reopened: the judge opens as it always did, and nothing is named.
    const awake = planTick(snapshot([review], [thorn, sable]), NOW);
    expect(awake.verifications).toEqual([
      { quest: Q1, verifier: 'sable', reason: 'same_family_other_model' },
    ]);
    expect(awake.judge_waits).toEqual([]);
  });

  it('names nobody while one judge’s mana is open, busy or not, or while the checks still run', () => {
    const asleep = { asleep: [{ tribe: CLAUDE, pool: 'claude' }] };
    // orin's pool is open: Q1 goes to orin.
    expect(planTick(snapshot([review], [thorn, sable, orin], asleep), NOW).judge_waits).toEqual([]);
    // sable judges another quest with its mana open: the usual wait for a free judge.
    const busy = character('sable', { cls: 'judge', model: 'claude-opus-5-5', status: 'reviewing' });
    expect(planTick(snapshot([review], [thorn, busy]), NOW)).toMatchObject({
      verifications: [],
      judge_waits: [],
    });
    // The checks of Q1 still run: it waits for them, not for a judge.
    const running = { ...asleep, background: { running: [Q1], checked: [] } };
    expect(planTick(snapshot([review], [thorn, sable], running), NOW).judge_waits).toEqual([]);
  });

  it('lists each pool once, with the latest reset of the windows that close it', () => {
    const maren = character('maren', { cls: 'judge', model: 'claude-opus-5-5-high' });
    const closed = {
      asleep: [{ tribe: GEMINI, pool: 'gemini_models' }],
      mana: {
        readings: [
          reading(CLAUDE, 'claude', 98, at(300)),
          { ...reading(CLAUDE, 'claude', 100, at(200)), window: 'weekly' as const },
          { ...reading(CLAUDE, 'claude', 10, at(500)), model: 'opus' },
          reading(GEMINI, 'gemini_models', 100, null),
        ],
        config: CONFIG,
      },
    };
    const plan = planTick(snapshot([review], [thorn, sable, maren, orin], closed), NOW);
    expect(plan.judge_waits).toEqual([
      {
        quest: Q1,
        gauges: [
          { tribe: CLAUDE, pool: 'claude', resets_at: at(300) },
          { tribe: GEMINI, pool: 'gemini_models' },
        ],
      },
    ]);
  });

  it('under machine_only, waits only on the judges of another family', () => {
    const machineOnly = {
      kingdom: {
        ...KINGDOM,
        dispatch: { ...KINGDOM.dispatch, verifier_same_family: 'machine_only' as const },
      },
      asleep: [{ tribe: GEMINI, pool: 'gemini_models' }],
    };
    // sable (Claude, the doer's family) is free, but machine_only waits for orin (Gemini), asleep.
    expect(planTick(snapshot([review], [thorn, sable, orin], machineOnly), NOW).judge_waits).toEqual([
      { quest: Q1, gauges: [{ tribe: GEMINI, pool: 'gemini_models' }] },
    ]);
  });
});

describe('judgeWaitOf', () => {
  const source = { kingdom: KINGDOM, asleep: [] };

  it('is nothing for a quest without judges to wait for', () => {
    expect(judgeWaitOf(Q1, [], () => false, source, NOW)).toBeUndefined();
  });

  it('reads no reset without readings, and none from a window that has reset or stays open', () => {
    expect(judgeWaitOf(Q1, [sable], () => false, source, NOW)).toEqual({
      quest: Q1,
      gauges: [{ tribe: CLAUDE, pool: 'claude' }],
    });
    const stale = reading(CLAUDE, 'claude', 100, at(60));
    const open = reading(CLAUDE, 'claude', 20, at(400));
    const withReadings = { ...source, mana: { readings: [stale, open], config: CONFIG, shares: [] } };
    expect(judgeWaitOf(Q1, [sable], () => false, withReadings, NOW)?.gauges).toEqual([
      { tribe: CLAUDE, pool: 'claude' },
    ]);
  });
});
