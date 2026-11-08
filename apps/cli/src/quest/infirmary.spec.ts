// `quest show` of a quest in the infirmary says why, from the last `quest.infirmary` line of its journal (P1-32): the
// trip and the detail in the owner's language, or the English reason of a line written before P1-32.
import { EventSchema, questViewOf } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir } from '../../test/cli.ts';
import type { Quest } from '@elvaria/domain';

const SICK = questFixture('infirmary', QUEST_ID, { attempts: 3 });

let next = 0;
/** A `quest.infirmary` line as the Steward writes it; ids differ so the journal keeps every line. */
function infirmaryLine(data: Record<string, unknown>, attempt?: number, quest: Quest = SICK) {
  next += 1;
  return EventSchema.parse({
    v: 1,
    id: `01M6RQ5Y000000000000000${String(next).padStart(3, '0')}`,
    ts: '2026-11-06T09:00:00+07:00',
    type: 'quest.infirmary',
    actor: { kind: 'steward' },
    quest: quest.id,
    territory: quest.territory,
    ...(attempt === undefined ? {} : { attempt }),
    data: { ...data, quest: questViewOf(quest) },
  });
}

describe('elvaria quest show of a quest in the infirmary', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const show = async (...lines: ReturnType<typeof infirmaryLine>[]) => {
    await openJournal(kingdom, QUEST_ID).append(lines);
    const io = testIo();
    expect(await run(io, 'quest', 'show', QUEST_ID, '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    return io.printed.out;
  };

  it('says the trip, the attempt and every part of the detail of the last line', async () => {
    await plantQuests(kingdom, SICK);
    const older = infirmaryLine({ reason: 'max_attempts', trip: 'max_attempts' }, 1);
    const why = 'it touches src/app.ts, outside laws.patch_paths (.husky/**)';
    const detail = { patch: why, wip: 'index.lock exists', apprentice_left: true };
    const out = await show(
      older,
      infirmaryLine({ reason: `breaker:commit: ${why}`, trip: 'commit', detail }, 2),
    );
    const at = out.indexOf(
      'In the infirmary since attempt 2: the commit was refused, so the branch lacks the work.',
    );
    expect(out.slice(at, at + 4)).toEqual([
      expect.any(String),
      `  Patch elvaria.patch not applied: ${why}`,
      '  The WIP commit was refused too; the work stays in the plot: index.lock exists',
      '  An apprentice of the session ran past its minutes or was cut at its turns: open a child quest for the work it left (see handover.md).',
    ]);
    expect(out.join('\n')).not.toContain('its attempts ran out');
    // Before the description, after the fields.
    expect(out.at(-1)).toBe(SICK.description);
  });

  it('speaks the owner language: Vietnamese by default', async () => {
    await plantQuests(kingdom, SICK);
    const line = infirmaryLine(
      { reason: 'breaker:time: ran 45 min', trip: 'time', detail: { message: 'ran 45 min' } },
      1,
    );
    await openJournal(kingdom, QUEST_ID).append([line]);
    const io = testIo();
    expect(await run(io, 'quest', 'show', QUEST_ID, '--kingdom', kingdom)).toBe(0);
    expect(io.printed.out).toContain('Vào trạm quân y ở lần thử 1: cầu dao thời gian ngắt phiên.');
    expect(io.printed.out).toContain('  Lời báo: ran 45 min');
  });

  it('shows the English reason of a line written before P1-32, which has no trip', async () => {
    await plantQuests(kingdom, SICK);
    const out = await show(infirmaryLine({ reason: 'breaker:time' }, 3));
    expect(out).toContain('In the infirmary since attempt 3: breaker:time.');
  });

  it('names the script, its follow-up, the verifiers stopped, and leaves out an attempt the line lacks', async () => {
    await plantQuests(kingdom, SICK);
    const failed = { script: 'link-check', follow_up: 'q_20261106_8m4n3b', verifiers_stopped: 2 };
    const out = await show(infirmaryLine({ reason: 'script:fail', trip: 'script_fail', detail: failed }));
    expect(out).toContain('In the infirmary: the script ran but did not pass.');
    expect(out).toContain(
      '  A breaker stopped 2 verifiers of this attempt, so no further one opens: raise the budget (elvaria quest edit) before a retry.',
    );
    expect(out).toContain('  Script: link-check');
    expect(out).toContain('  Follow-up quest opened: q_20261106_8m4n3b');
  });

  it('says nothing of the infirmary for a quest that has left it', async () => {
    const open = questFixture('open');
    await plantQuests(kingdom, open);
    const out = await show(infirmaryLine({ reason: 'max_attempts' }, 1, open));
    expect(out.join('\n')).not.toContain('infirmary');
  });

  it('says nothing more for a quest in the infirmary whose journal has no such line', async () => {
    await plantQuests(kingdom, SICK);
    const out = await show();
    expect(out.join('\n')).not.toContain('In the infirmary');
    expect(out.at(-1)).toBe(SICK.description);
  });
});
