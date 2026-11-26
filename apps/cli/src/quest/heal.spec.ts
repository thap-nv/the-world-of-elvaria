// `quest list` and `quest show` of a quest in its run's heal (ADR 0034, HL-02): a submit the territory's hooks refused
// went back, with no bell, for a fresh session of the same run. The list marks it while it waits and while that session
// runs; `quest show` says why from the run's `quest.heal_due` line, as the infirmary would have said it.
import { EVENT_VERSION, EventSchema, questViewOf } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { QUEST_ID, plantQuests, questFixture } from '../__fixtures__/quest.ts';
import type { TempDir } from '../__fixtures__/cli.ts';
import type { Attempt } from '@elvaria/domain';

const entry = (heal: Attempt['heal'], ended: boolean): Record<string, unknown> => ({
  n: 1,
  character: 'thorn',
  role: 'assignee',
  started_at: '2026-11-06T08:00:00+07:00',
  ...(ended ? { ended_at: '2026-11-06T08:20:00+07:00', outcome: 'breaker' } : {}),
  run_dir: `.runs/${QUEST_ID}-1`,
  heal,
});
const DUE = questFixture('returned', QUEST_ID, {
  assignee: 'thorn',
  attempts: 1,
  attempt_log: [entry('due', true)],
});
const HEALING = questFixture('working', QUEST_ID, {
  assignee: 'thorn',
  attempts: 1,
  attempt_log: [entry('due', true), entry('session', false)],
});
const LOG = `.runs/${QUEST_ID}-1/pre-commit.log`;
const HOOK = 'src/app.ts:3:7 error no-unused-vars';

const healDueLine = () =>
  EventSchema.parse({
    v: EVENT_VERSION,
    id: '01M6RQ5Y000000000000000001',
    ts: '2026-11-06T08:20:00+07:00',
    type: 'quest.heal_due',
    actor: { kind: 'steward' },
    quest: QUEST_ID,
    territory: DUE.territory,
    attempt: 1,
    data: {
      reason: {
        code: 'breaker:commit_errors',
        params: { lines: HOOK, total_lines: 28, errors: 1, log: LOG },
      },
      quest: questViewOf(DUE),
    },
  });

describe("a quest in its run's heal", () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const out = async (...args: string[]) => {
    const io = testIo();
    expect(await run(io, 'quest', ...args, '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    return io.printed.out;
  };
  const rowOf = (lines: readonly string[]) => lines.find((line) => line.includes(QUEST_ID)) ?? '';

  it('is marked in quest list while it waits for the heal session and while that session runs', async () => {
    await plantQuests(kingdom, DUE);
    expect(rowOf(await out('list'))).toContain('(awaits a heal)');
    await plantQuests(kingdom, HEALING);
    expect(rowOf(await out('list'))).toContain('(healing)');
  });

  // HL-05: a healer's session (`healing`), and a run whose healer's session ended without the heal (awaitsHeal).
  it("is marked while a healer heals it, and again when the healer's session ended without the heal", async () => {
    const healer = { ...entry('session', false), character: 'mira', run_dir: `.runs/${QUEST_ID}-1/heal` };
    const healing = questFixture('healing', QUEST_ID, {
      assignee: 'thorn',
      attempts: 1,
      attempt_log: [entry('due', true), healer],
    });
    await plantQuests(kingdom, healing);
    expect(rowOf(await out('list'))).toContain('(healing)');
    const ended = { ...healer, ended_at: '2026-11-06T08:30:00+07:00', outcome: 'paused' };
    const again = questFixture('returned', QUEST_ID, {
      assignee: 'thorn',
      attempts: 1,
      attempt_log: [entry('due', true), ended],
    });
    await plantQuests(kingdom, again);
    expect(rowOf(await out('list'))).toContain('(awaits a heal)');
  });

  it('is not marked once the heal session ended, nor in a run without a heal', async () => {
    const ended = questFixture('review', QUEST_ID, {
      assignee: 'thorn',
      attempts: 1,
      attempt_log: [entry('due', true), entry('session', true)],
    });
    await plantQuests(kingdom, ended);
    expect(rowOf(await out('list'))).not.toMatch(/heal/u);
    await plantQuests(kingdom, questFixture('returned', QUEST_ID, { assignee: 'thorn', attempts: 1 }));
    expect(rowOf(await out('list'))).not.toMatch(/heal/u);
  });

  it("says in quest show why, with the hook's lines and the log, from the run's heal_due line", async () => {
    await plantQuests(kingdom, DUE);
    await openJournal(kingdom, QUEST_ID).append([healDueLine()]);
    const shown = await out('show', QUEST_ID);
    expect(shown.find((line) => line.startsWith('Status'))).toContain('(returned) (awaits a heal)');
    const at = shown.findIndex((line) => line.startsWith('Being healed in attempt 1:'));
    expect(at).toBeGreaterThan(-1);
    const said = shown.slice(at + 1).join('\n');
    expect(said).toContain(HOOK);
    expect(said).toContain(LOG);
  });

  it('says only that it is healed when the journal has no heal_due line', async () => {
    await plantQuests(kingdom, HEALING);
    const shown = await out('show', QUEST_ID);
    expect(shown.find((line) => line.startsWith('Being healed in attempt 1:'))).toBeDefined();
  });
});
