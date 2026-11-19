// PS-28c: the table "after the reminder" of `elvaria metrics`, from lines as the Steward (agent.session.wrap_up) and
// the runner (agent.session.end) write them, on the three sessions of run (J) (plans/session-stamina.md).
import { EVENT_VERSION, EventSchema, metricsOf } from '@elvaria/domain';
import type { CharacterId, Event, TribeId } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { translator } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { metricsSections } from './view.ts';
import { afterWrapUpSection } from './view-wrap-ups.ts';
import type { TempDir } from '../../test/cli.ts';

const t = translator('en');
const DAY = '2026-11-17';
const QUEST = 'q_20261117_m8d5t2';
const LIMIT = 300_060;
const QUILL = { id: 'quill' as CharacterId, tribe: 'gemini' as TribeId };

let serial = 0;
const ulid = (): string => {
  serial += 1;
  return `01JC${String(serial).padStart(22, '0')}`;
};

function line(
  type: string,
  time: string,
  session: string,
  data: object,
  actor: object = { kind: 'steward' },
) {
  return EventSchema.parse({
    v: EVENT_VERSION,
    id: ulid(),
    ts: `${DAY}T${time}+07:00`,
    type,
    actor,
    quest: QUEST,
    attempt: 1,
    session,
    data,
  });
}

const wrapUp = (session: string, time: string, used: number, measure = 'tokens'): Event =>
  line('agent.session.wrap_up', time, session, { measure, used, limit: LIMIT, pct: (used * 100) / LIMIT });

const end = (session: string, time: string, outcome: string, tokens: number): Event =>
  line(
    'agent.session.end',
    time,
    session,
    { outcome, usage: { tokens } },
    { kind: 'character', id: QUILL.id },
  );

/** Quill's three sessions of run 1, 2026-11-17: cut, cut, then handed in. */
const RUN_J = (): Event[] => [
  wrapUp('s1', '17:40:59', 256_060),
  end('s1', '17:46:09', 'killed', 462_564),
  wrapUp('s2', '18:00:29', 262_433),
  end('s2', '18:05:00', 'killed', 495_826),
  wrapUp('s3', '18:16:58', 304_713),
  end('s3', '18:21:59', 'completed', 444_882),
];

const ledger = (events: readonly Event[], characters = [QUILL]) =>
  metricsOf({ quests: [], verdicts: [], events, commands: [], characters });

describe('the table after the reminder (PS-28c)', () => {
  it('prints one row per tribe: reminded, ended on their own, cut, and the medians after the reminder', () => {
    const section = afterWrapUpSection(t, ledger(RUN_J()));
    expect(section.title).toBe('After the wrap-up reminder, by tribe (assignee sessions that ended)');
    expect(section.table?.header).toEqual([
      'Tribe',
      'Reminded',
      'Ended on their own',
      'Cut',
      'Tokens after (median)',
      'Minutes to the end (median)',
    ]);
    expect(section.table?.rows).toEqual([['gemini', '3', '1', '2', '206504', '5.0']]);
  });

  it('says none with no reminded session, and dashes for no tribe and no tokens', () => {
    expect(afterWrapUpSection(t, ledger([])).lines).toEqual(['None.']);
    const minutes = [wrapUp('m1', '10:00:00', 51, 'time'), end('m1', '10:09:30', 'killed', 400_000)];
    expect(afterWrapUpSection(t, ledger(minutes, [])).table?.rows).toEqual([
      ['—', '1', '0', '1', '—', '9.5'],
    ]);
  });

  it('comes before the prompt sizes, and the limits say what it counts', () => {
    const titles = metricsSections(t, ledger(RUN_J())).map(({ title }) => title);
    expect(titles.slice(-3)).toEqual([
      'After the wrap-up reminder, by tribe (assignee sessions that ended)',
      'Prompt size by role and block (characters)',
      'Known limits',
    ]);
    const limits = metricsSections(t, ledger([])).at(-1)?.lines.join('\n') ?? '';
    expect(limits).toContain(
      'After the reminder counts only assignee sessions with an agent.session.wrap_up line',
    );
    expect(limits).toContain("does not say whether the hook's reminder reached the model");
  });
});

describe('elvaria metrics after the reminder', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  it("takes a session's tribe from the kingdom's characters", async () => {
    const summon = [
      'add',
      'quill',
      '--class',
      'scribe',
      '--tribe',
      'gemini',
      '--model',
      'gemini-4-argon-medium',
    ];
    expect(await run(testIo(), 'character', ...summon, '--kingdom', kingdom)).toBe(0);
    // Still running: no end yet, so not counted.
    await openEventLog(kingdom).append([...RUN_J(), wrapUp('s4', '19:00:00', 260_000)]);
    const io = testIo();
    const args = ['--since', DAY, '--until', DAY, '--kingdom', kingdom, '--locale', 'en'];
    expect(await run(io, 'metrics', ...args)).toBe(0);
    expect(printed(io)).toContain('After the wrap-up reminder, by tribe (assignee sessions that ended)');
    expect(printed(io)).toMatch(/gemini\s+3\s+1\s+2\s+206504\s+5\.0/);
  });
});
