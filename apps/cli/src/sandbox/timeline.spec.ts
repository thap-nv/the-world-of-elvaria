// The timeline says the reason of a `quest.infirmary` line in the owner's language (contract infirmary-reason-codes),
// one row per line: the sentence only, never the hook's lines.
import { EVENT_VERSION, EventSchema, questViewOf } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { QUEST_ID, questFixture } from '../__fixtures__/quest.ts';
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

const probe = (data: Record<string, unknown>) =>
  EventSchema.parse({
    v: EVENT_VERSION,
    id: '01M6RQ5Y000000000000000001',
    ts: '2026-11-06T09:00:00+07:00',
    type: 'mana.probe',
    actor: { kind: 'steward' },
    data: { tribe: 'claude', result: 'error', ...data },
  });

describe('the timeline of mana.probe', () => {
  it.each([
    ['vi', 'Nhiếp chính thử mana của tộc claude: đã dùng hết hạn mức: weekly; CLI text verbatim'],
    ['en', 'The Steward probes the mana of tribe claude: usage full: weekly; CLI text verbatim'],
  ] as const)('translates notes in %s and preserves CLI text', (locale, expected) => {
    const line = probe({
      note: { code: 'probe:usage_full', params: { windows: 'weekly' } },
      cli_text: 'CLI text verbatim',
    });
    expect(timeline({ t: translator(locale), locale })(line)).toBe(`09:00:00  ${expected}`);
  });

  it('keeps a historical detail verbatim and leaves a silent probe unchanged', () => {
    const say = timeline({ t: translator('en'), locale: 'en' });
    expect(say(probe({ detail: 'old detail: Keep CASE' }))).toBe(
      '09:00:00  The Steward probes the mana of tribe claude: old detail: Keep CASE',
    );
    expect(say(probe({}))).toBe('09:00:00  The Steward probes the mana of tribe claude');
  });

  it.each([
    null,
    [],
    { code: 'probe:future', params: {} },
    { code: 'probe:usage_full', params: {} },
    { code: 'probe:usage_full', params: { windows: [] } },
    { code: 'probe:usage_full', params: null },
  ])('ignores a malformed open-data note and preserves outside text: %j', (note) => {
    const say = timeline({ t: translator('en'), locale: 'en' });
    expect(say(probe({ note, cli_text: 'raw' }))).toBe(
      '09:00:00  The Steward probes the mana of tribe claude: raw',
    );
  });
});
