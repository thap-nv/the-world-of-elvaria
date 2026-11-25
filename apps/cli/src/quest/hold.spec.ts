// `elvaria quest hold|unhold|submit` (fix/quest-hold): each writes one command, refused at the terminal when the
// Steward would refuse it; `quest list` marks a held quest and `quest show` says since when and why.
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../__fixtures__/quest.ts';
import type { TempDir } from '../__fixtures__/cli.ts';
import type { InboxCommand } from '@elvaria/domain';

const HELD = { held: { at: '2026-11-16T22:00:00+07:00', reason: 'Waits for PS-09 on main.' } };

const entry = (role: 'assignee' | 'verifier', character: string, outcome: string) => ({
  n: 1,
  character,
  role,
  started_at: '2026-11-06T08:10:00+07:00',
  ended_at: '2026-11-06T08:40:00+07:00',
  outcome,
  run_dir: role === 'assignee' ? `.runs/${QUEST_ID}-1` : `.runs/${QUEST_ID}-1/verify`,
});
/** A session cut after its work: the infirmary, its last entry the assignee's. */
const cut = { assignee: 'thorn', attempts: 1, attempt_log: [entry('assignee', 'thorn', 'breaker')] };
/** A review whose judge left without a verdict: its last entry a judge's. */
const stalled = { ...cut, attempt_log: [...cut.attempt_log, entry('verifier', 'sable', 'crash')] };

describe('elvaria quest hold, unhold and submit', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const quest = (io: ReturnType<typeof testIo>, ...args: string[]) =>
    run(io, 'quest', ...args, '--kingdom', kingdom, '--locale', 'en');
  const inbox = async () =>
    (await openKingdom(kingdom).inbox.read()).flatMap((item) =>
      item.command.ok ? [item.command.value] : [],
    );
  const sent = async () => (await inbox()).map(({ kind, payload }: InboxCommand) => ({ kind, payload }));

  it('holds an open quest with why, and a claimed one without', async () => {
    await plantQuests(
      kingdom,
      questFixture('open'),
      questFixture('claimed', OTHER_QUEST_ID, { assignee: 'thorn' }),
    );
    const io = testIo();
    expect(await quest(io, 'hold', QUEST_ID, '--reason', 'next run')).toBe(0);
    expect(await quest(testIo(), 'hold', OTHER_QUEST_ID)).toBe(0);
    expect(await sent()).toEqual([
      { kind: 'hold', payload: { quest: QUEST_ID, reason: 'next run' } },
      { kind: 'hold', payload: { quest: OTHER_QUEST_ID } },
    ]);
    expect(io.printed.out[0]).toContain(`elvaria quest unhold ${QUEST_ID}`);
  });

  it('refuses a hold on a quest a session already holds, or one held already', async () => {
    const review = { ...cut, attempt_log: [entry('assignee', 'thorn', 'submitted')] };
    await plantQuests(
      kingdom,
      questFixture('review', QUEST_ID, review),
      questFixture('open', OTHER_QUEST_ID, HELD),
    );
    const working = testIo();
    expect(await quest(working, 'hold', QUEST_ID)).toBe(1);
    expect(working.printed.err[0]).toContain('only an open quest, or one claimed and not started yet');
    const twice = testIo();
    expect(await quest(twice, 'hold', OTHER_QUEST_ID)).toBe(1);
    expect(twice.printed.err[0]).toContain('is held already');
    expect(await inbox()).toEqual([]);
  });

  it('lifts a hold, and refuses a quest that has none', async () => {
    await plantQuests(kingdom, questFixture('open', QUEST_ID, HELD), questFixture('open', OTHER_QUEST_ID));
    expect(await quest(testIo(), 'unhold', QUEST_ID)).toBe(0);
    const none = testIo();
    expect(await quest(none, 'unhold', OTHER_QUEST_ID)).toBe(1);
    expect(none.printed.err).toEqual([`Quest ${OTHER_QUEST_ID} is not held.`]);
    expect(await sent()).toEqual([{ kind: 'unhold', payload: { quest: QUEST_ID } }]);
  });

  it('sends the work of a quest in the infirmary to review', async () => {
    await plantQuests(kingdom, questFixture('infirmary', QUEST_ID, cut));
    const io = testIo();
    expect(await quest(io, 'submit', QUEST_ID)).toBe(0);
    expect(await sent()).toEqual([{ kind: 'submit', payload: { quest: QUEST_ID } }]);
    expect(io.printed.out[0]).toContain('then sends it to review');
  });

  it('refuses a quest out of the infirmary, and a stalled review, which retry sends back', async () => {
    await plantQuests(kingdom, questFixture('open'), questFixture('infirmary', OTHER_QUEST_ID, stalled));
    const open = testIo();
    expect(await quest(open, 'submit', QUEST_ID)).toBe(1);
    expect(open.printed.err[0]).toContain('only a quest in the infirmary goes to review');
    const judged = testIo();
    expect(await quest(judged, 'submit', OTHER_QUEST_ID)).toBe(1);
    expect(judged.printed.err[0]).toContain(`elvaria quest retry ${OTHER_QUEST_ID}`);
    const missing = testIo();
    expect(await quest(missing, 'submit', 'q_20261106_zzzzzz')).toBe(1);
    expect(await quest(testIo(), 'hold', 'q_20261106_zzzzzz')).toBe(1);
    expect(await inbox()).toEqual([]);
  });

  it('marks a held quest on the board, and shows since when and why', async () => {
    await plantQuests(
      kingdom,
      questFixture('open', QUEST_ID, HELD),
      questFixture('claimed', OTHER_QUEST_ID, { assignee: 'thorn', held: { at: HELD.held.at } }),
    );
    const board = testIo();
    expect(await quest(board, 'list')).toBe(0);
    expect(board.printed.out[1]).toMatch(new RegExp(`^${QUEST_ID}\\s+Open \\(held\\)`));
    const shown = testIo();
    expect(await quest(shown, 'show', QUEST_ID)).toBe(0);
    expect(shown.printed.out.join('\n')).toMatch(/Held\s+since 2026-11-16T22:00:00\+07:00: Waits for PS-09/);
    const bare = testIo();
    expect(await quest(bare, 'show', OTHER_QUEST_ID)).toBe(0);
    expect(bare.printed.out.join('\n')).toMatch(/Held\s+since 2026-11-16T22:00:00\+07:00\n/);
  });
});
