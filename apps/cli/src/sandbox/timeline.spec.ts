// The timeline says the reason of a `quest.infirmary` line in the owner's language (contract infirmary-reason-codes),
// one row per line: the sentence only, never the hook's lines.
import { EVENT_VERSION, EventSchema, questViewOf } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { QUEST_ID, questFixture } from '../../test/quest.ts';
import { timeline } from './timeline.ts';

const SICK = questFixture('infirmary', QUEST_ID);

const infirmary = (reason: unknown) =>
  EventSchema.parse({
    v: EVENT_VERSION,
    id: '01M6RQ5Y000000000000000001',
    ts: '2026-11-06T09:00:00+07:00',
    type: 'quest.infirmary',
    actor: { kind: 'steward' },
    quest: SICK.id,
    territory: SICK.territory,
    data: { reason, quest: questViewOf(SICK) },
  });

describe('the timeline of a quest.infirmary line', () => {
  it('says a coded reason in the owner language, its sentence only', () => {
    const say = timeline({ t: translator('vi'), locale: 'vi' });
    const reason = {
      code: 'breaker:commit',
      params: { lines: 'boom', total_lines: 1, log: '.runs/q-1/pre-commit.log' },
    };
    expect(say(infirmary(reason))).toBe(
      `09:00:00  ${SICK.id} vào trạm quân y (hook pre-commit từ chối commit, nên nhánh thiếu phần việc; output có 1 dòng (đủ ở .runs/q-1/pre-commit.log), mấy dòng đầu ở dưới)`,
    );
    const judge = { code: 'judge:time', params: { stopped: 2, run: 3 } };
    expect(timeline({ t: translator('en'), locale: 'en' })(infirmary(judge))).toBe(
      `09:00:00  ${SICK.id} goes to the infirmary (the time breaker cut 2 verifiers of attempt 3)`,
    );
  });

  it('says the old words of a line written before the codes verbatim', () => {
    const say = timeline({ t: translator('en'), locale: 'en' });
    const reason = { code: 'legacy', params: { text: 'breaker:time: ran 45 min' } };
    expect(say(infirmary(reason))).toBe(
      `09:00:00  ${SICK.id} goes to the infirmary (breaker:time: ran 45 min)`,
    );
  });
});
