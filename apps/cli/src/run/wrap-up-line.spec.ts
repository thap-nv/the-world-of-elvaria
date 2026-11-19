// The console bell at the reminder mark (PS-28b, TL4): who is past the mark of which ceiling, what follows if the owner
// does nothing, and the command that lifts the ceiling with the quest's id and the figure it must reach.
import { CharacterIdSchema, QuestIdSchema } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { lineOf } from './bell.ts';
import type { Notice } from '@elvaria/steward';

const en = translator('en');
const vi = translator('vi');
const quest = { id: QuestIdSchema.parse('q_20261117_m8d5t2'), title: 'Viết hướng dẫn', rank: 'C' } as const;
const quill = CharacterIdSchema.parse('quill');
/** Phiên 1 of lần (J): 256 060 tokens past the mark of a 300 060 ceiling, cut at 450 090. */
const TOKENS: Notice = {
  kind: 'wrap_up',
  quest,
  role: 'assignee',
  character: quill,
  measure: 'tokens',
  used: 256_060,
  limit: 300_060,
  cut_at: 450_090,
  raise_from: 333_401,
};

describe('the console bell at the reminder mark', () => {
  it("tells of an assignee's session with the command that lifts its token ceiling", () => {
    expect(lineOf(en, TOKENS)).toBe(
      "Quest q_20261117_m8d5t2 «Viết hướng dẫn»: assignee quill's session is past the reminder mark, 256060 of a ceiling of 300060 tokens. It was told to wrap up. If you do nothing it is cut at 450090 tokens; if it made progress a fresh session goes on, without this one's memory. To give it more: elvaria quest edit q_20261117_m8d5t2 --max-tokens <n>, with n from 333401 up; anything lower changes nothing.",
    );
    expect(lineOf(vi, TOKENS)).toContain(
      'Tiếp sức: elvaria quest edit q_20261117_m8d5t2 --max-tokens <số>, với số từ 333401 trở lên',
    );
  });

  it("tells of a judge's session on minutes: no reminder, and the review starts over if it is cut", () => {
    const judge: Notice = {
      ...TOKENS,
      role: 'verifier',
      character: null,
      measure: 'time',
      used: 38.41666,
      limit: 45,
      cut_at: 67.5,
      raise_from: 46,
    };
    expect(lineOf(en, judge)).toBe(
      "Quest q_20261117_m8d5t2 «Viết hướng dẫn»: judge —'s session is past the reminder mark, 38.4 of a ceiling of 45 minutes. A judge gets no reminder. If you do nothing it is cut at 67.5 minutes and the review starts over with another judge. To give it more: elvaria quest edit q_20261117_m8d5t2 --max-minutes <n>, with n from 46 up.",
    );
  });

  it('only tells of turns, which have no knob per quest', () => {
    const { raise_from: _, ...rest } = TOKENS;
    const turns: Notice = { ...rest, measure: 'turns', used: 171, limit: 200, cut_at: 300 };
    expect(lineOf(en, turns)).toMatch(
      /cut at 300 turns; .* Turns have no knob per quest: this bell only tells you\.$/,
    );
  });
});
