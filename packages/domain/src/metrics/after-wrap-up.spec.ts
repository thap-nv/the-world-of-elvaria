import { describe, expect, it } from 'vitest';

import { afterWrapUpOf } from './after-wrap-up.ts';
import { lineOf } from './__fixtures__/ledger.ts';
import { metricsOf } from './metrics-of.ts';
import type { CharacterId, TribeId } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';

const QUEST = 'q_20261117_m8d5t2';
const QUILL = 'quill' as CharacterId;
const THORN = 'thorn' as CharacterId;
const CHARACTERS = [
  { id: QUILL, tribe: 'gemini' as TribeId },
  { id: THORN, tribe: 'claude' as TribeId },
];

/** A time of 2026-11-17 in the kingdom's zone, as the log writes it. */
const on17 = (time: string, day = '2026-11-17'): string => `${day}T${time}+07:00`;

/** The Steward's line at the soft ceiling of `session` (sessions/wrap-up.ts). */
function wrapUp(session: string, ts: string, used: number, measure = 'tokens', limit = 300_060): Event {
  const pct = (used * 100) / limit;
  return {
    ...lineOf('agent.session.wrap_up', { measure, used, limit, pct }, ts, QUEST),
    attempt: 1,
    session,
  };
}

/** The runner's last line of `session` (runner-core run-log.ts): the character's own. */
function end(session: string, ts: string, outcome: string, tokens?: number, character = QUILL): Event {
  const data = tokens === undefined ? { outcome } : { outcome, usage: { tokens } };
  const line = lineOf('agent.session.end', data, ts, QUEST);
  return { ...line, attempt: 1, session, actor: { kind: 'character', id: character } };
}

/** The three sessions of run 1 of the 2026-11-17 run (J), as plans/session-stamina.md reads them. */
const RUN_J: readonly Event[] = [
  wrapUp('s1', on17('17:40:59'), 256_060),
  end('s1', on17('17:46:09'), 'killed', 462_564),
  wrapUp('s2', on17('18:00:29'), 262_433),
  end('s2', on17('18:05:00'), 'killed', 495_826),
  wrapUp('s3', on17('18:16:58'), 304_713),
  end('s3', on17('18:21:59'), 'completed', 444_882),
];

describe('afterWrapUpOf (PS-28c)', () => {
  it('reads run (J): one gemini row, three reminded, one ended on its own, two cut', () => {
    expect(afterWrapUpOf(RUN_J, CHARACTERS)).toEqual([
      {
        tribe: 'gemini',
        reminded: 3,
        completed: 1,
        cut: 2,
        median_tokens: 206_504,
        // 5 min 10 s, 4 min 31 s and 5 min 1 s: the middle one.
        median_minutes: 301 / 60,
      },
    ]);
  });

  it('leaves out a session still running, and gives a tribe with no reminded session no row', () => {
    const events = [
      ...RUN_J,
      wrapUp('s4', on17('19:00:00'), 260_000),
      // Thorn's session ended with no reminder.
      end('t1', on17('19:05:00'), 'completed', 100_000, THORN),
    ];
    expect(afterWrapUpOf(events, CHARACTERS).map(({ tribe, reminded }) => [tribe, reminded])).toEqual([
      ['gemini', 3],
    ]);
  });

  it('counts no tokens for a reminder on minutes, nor for an end without usage', () => {
    const events = [
      wrapUp('m1', on17('10:00:00'), 51, 'time', 60),
      end('m1', on17('10:09:30'), 'killed', 400_000),
      wrapUp('m2', on17('11:00:00'), 260_000),
      end('m2', on17('11:02:00'), 'completed'),
    ];
    const [row] = afterWrapUpOf(events, CHARACTERS);
    expect(row).toMatchObject({ reminded: 2, completed: 1, cut: 1, median_tokens: null });
    expect(row?.median_minutes).toBeCloseTo(5.75);
  });

  it('counts an end that failed only as reminded, and no tokens below the reminder', () => {
    const events = [
      wrapUp('e1', on17('10:00:00'), 260_000),
      end('e1', on17('10:01:00'), 'error', 250_000),
      wrapUp('e2', on17('10:00:00'), 260_000),
      end('e2', on17('10:03:00'), 'max_turns', 270_000),
      wrapUp('e3', on17('10:00:00'), 260_000),
      end('e3', on17('10:05:00'), 'budget', 290_000),
    ];
    expect(afterWrapUpOf(events, CHARACTERS)).toEqual([
      { tribe: 'gemini', reminded: 3, completed: 0, cut: 2, median_tokens: 10_000, median_minutes: 3 },
    ]);
  });

  it('takes the first reminder and the first end of a session, and skips lines with no session', () => {
    const events = [
      lineOf(
        'agent.session.wrap_up',
        { measure: 'tokens', used: 1, limit: 2, pct: 50 },
        on17('09:00:00'),
        QUEST,
      ),
      wrapUp('s1', on17('17:40:59'), 256_060),
      // A restarted Steward said it again: the first one counts.
      wrapUp('s1', on17('17:42:00'), 300_000),
      end('s1', on17('17:46:09'), 'killed', 462_564),
      end('s1', on17('17:46:10'), 'killed', 462_564),
    ];
    expect(afterWrapUpOf(events, CHARACTERS)).toEqual([
      {
        tribe: 'gemini',
        reminded: 1,
        completed: 0,
        cut: 1,
        median_tokens: 206_504,
        median_minutes: 310 / 60,
      },
    ]);
  });

  it('puts a character it does not know, or an end that is no character’s, under no tribe, in tribe order', () => {
    const stewardEnd: Event = { ...end('k2', on17('10:02:00'), 'killed', 1), actor: { kind: 'steward' } };
    // Ended in the order gemini, no tribe, claude.
    const events = [
      wrapUp('g1', on17('10:00:00'), 260_000),
      end('g1', on17('10:00:30'), 'completed', 300_000),
      wrapUp('k1', on17('10:00:00'), 260_000),
      end('k1', on17('10:01:00'), 'completed', 300_000, 'wren' as CharacterId),
      wrapUp('k2', on17('10:00:00'), 260_000),
      stewardEnd,
      wrapUp('c1', on17('10:00:00'), 260_000),
      end('c1', on17('10:04:00'), 'completed', 300_000, THORN),
    ];
    expect(afterWrapUpOf(events, CHARACTERS).map(({ tribe, reminded }) => [tribe, reminded])).toEqual([
      [null, 2],
      ['claude', 1],
      ['gemini', 1],
    ]);
  });

  it('counts a session by the day of its reminder', () => {
    const events = [
      ...RUN_J,
      wrapUp('n1', on17('23:58:00'), 260_000),
      end('n1', on17('00:03:00', '2026-11-18'), 'completed', 300_000),
    ];
    expect(afterWrapUpOf(events, CHARACTERS, { since: '2026-11-18' })).toEqual([]);
    expect(afterWrapUpOf(events, CHARACTERS, { until: '2026-11-17' })[0]?.reminded).toBe(4);
  });

  it('is part of the ledger, by the characters the ledger read', () => {
    const input = { quests: [], verdicts: [], events: RUN_J, commands: [] };
    expect(metricsOf({ ...input, characters: CHARACTERS }).after_wrap_up[0]?.tribe).toBe('gemini');
    expect(metricsOf(input).after_wrap_up[0]?.tribe).toBeNull();
  });
});
