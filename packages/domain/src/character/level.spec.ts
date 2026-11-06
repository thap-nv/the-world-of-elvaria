import { describe, expect, it } from 'vitest';

import { canTake, levelChange, rankCeilingOf } from './level.ts';
import type { VerdictId } from '../core/ids.ts';
import type { VerdictEntry } from '../schema/character/character.ts';

const at = (m: number) => `2026-11-06T10:${String(m).padStart(2, '0')}:00+07:00`;
/** One verdict per minute from minute 1: p / f an agent's pass / fail, h / x the owner's pass / fail. */
const window = (results: string): VerdictEntry[] =>
  Array.from(results, (mark, index) => ({
    verdict_id: `q_20261105_4c8n2d-${index + 1}` as VerdictId,
    result: 'fx'.includes(mark) ? 'fail' : 'pass',
    by_human: 'hx'.includes(mark),
    at: at(index + 1),
  }));

const character = (level: number, results: string, level_since?: string) => ({
  level,
  ...(level_since === undefined ? {} : { level_since }),
  reputation: { window: window(results) },
});

describe('rankCeilingOf', () => {
  it("follows the owner's table F E D C C B B A A S", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(rankCeilingOf).join(' ')).toBe('F E D C C B B A A S');
  });

  it('gives a level outside 1–10 only F', () => {
    expect(rankCeilingOf(0)).toBe('F');
    expect(rankCeilingOf(11)).toBe('F');
  });
});

describe('canTake', () => {
  it('takes up to the ceiling, one rank above only when nobody else can, never two above', () => {
    // Level 5 takes C as a matter of course.
    expect(canTake(5, 'F', false)).toBe(true);
    expect(canTake(5, 'C', false)).toBe(true);
    expect(canTake(5, 'B', false)).toBe(false);
    expect(canTake(5, 'B', true)).toBe(true);
    expect(canTake(5, 'A', true)).toBe(false);
  });

  it('lets level 10 take everything and a new character F, or E when nobody else can', () => {
    expect(canTake(10, 'S', false)).toBe(true);
    expect(canTake(1, 'E', false)).toBe(false);
    expect(canTake(1, 'E', true)).toBe(true);
    expect(canTake(1, 'D', true)).toBe(false);
  });
});

describe('levelChange', () => {
  it('goes up after 10 verdicts at 85 % or more, and no further than 10', () => {
    expect(levelChange(character(3, 'ppppppppp'))).toBe(3);
    expect(levelChange(character(3, 'pppppppppp'))).toBe(4);
    expect(levelChange(character(3, 'fppppppppppp'))).toBe(4);
    expect(levelChange(character(10, 'pppppppppp'))).toBe(10);
  });

  it('weighs the owner three times but counts the verdict once', () => {
    // 9 agent passes and one return by the owner: 9 / 12 = 75 %.
    expect(levelChange(character(3, 'pppppppppx'))).toBe(3);
    // A royal seal is still one verdict towards the 10.
    expect(levelChange(character(3, 'pppppppph'))).toBe(3);
    expect(levelChange(character(3, 'ppppppppph'))).toBe(4);
  });

  it('goes down after 5 verdicts under 60 %, and no lower than 1', () => {
    expect(levelChange(character(4, 'ffff'))).toBe(4);
    expect(levelChange(character(4, 'ffffp'))).toBe(3);
    expect(levelChange(character(4, 'ffppp'))).toBe(4);
    expect(levelChange(character(1, 'fffff'))).toBe(1);
  });

  it('counts only the verdicts after the last level change, so a streak moves the level once', () => {
    // Up at the tenth verdict (minute 10); the eleventh pass does not raise it again.
    expect(levelChange(character(4, 'ppppppppppp', at(10)))).toBe(4);
    // One fail right after the change is not five verdicts: no drop either.
    expect(levelChange(character(4, 'ppppppppppf', at(10)))).toBe(4);
    // Five verdicts after the change, four of them fails.
    expect(levelChange(character(4, 'ppppppppppffffp', at(10)))).toBe(3);
  });

  it('stays put without verdicts', () => {
    expect(levelChange(character(6, ''))).toBe(6);
  });
});
