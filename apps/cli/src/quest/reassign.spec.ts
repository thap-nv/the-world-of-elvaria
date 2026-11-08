import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir } from '../../test/cli.ts';
import type { CharacterId } from '@elvaria/domain';

/** What a quest someone works on, or was returned to, carries on top. */
const HELD = { assignee: 'wren', attempts: 1 };

describe('elvaria quest retry, reassign (P1-26)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const quest = (io: ReturnType<typeof testIo>, ...args: string[]) =>
    run(io, 'quest', ...args, '--kingdom', kingdom, '--locale', 'en');
  const summon = (id: string, ...args: string[]) =>
    run(testIo(), 'character', 'add', id, ...args, '--kingdom', kingdom);
  const sent = async () =>
    (await openKingdom(kingdom).inbox.read()).flatMap(({ command }) =>
      command.ok ? [{ kind: command.value.kind, payload: command.value.payload }] : [],
    );

  it('retries a quest in the infirmary, and refuses one anywhere else', async () => {
    await plantQuests(kingdom, questFixture('infirmary'), questFixture('working', OTHER_QUEST_ID, HELD));
    const io = testIo();
    expect(await quest(io, 'retry', QUEST_ID)).toBe(0);
    expect(io.printed.out[0]).toBe(`Sent the command to open quest ${QUEST_ID} again.`);
    const refused = testIo();
    expect(await quest(refused, 'retry', OTHER_QUEST_ID)).toBe(1);
    expect(refused.printed.err).toEqual([
      `Quest ${OTHER_QUEST_ID} is «Working»: only a quest in the infirmary can be retried.`,
    ]);
    expect(await sent()).toEqual([{ kind: 'retry', payload: { quest: QUEST_ID } }]);
  });

  it('says a stalled review goes back to review, not open (owner after P1-23)', async () => {
    const entry = (character: string, role: string, minute: number, outcome: string) => ({
      n: 1,
      character,
      role,
      started_at: `2026-11-06T08:${String(minute).padStart(2, '0')}:00+07:00`,
      ended_at: `2026-11-06T08:${String(minute + 5).padStart(2, '0')}:00+07:00`,
      outcome,
      run_dir: role === 'verifier' ? `.runs/${QUEST_ID}-1/verify` : `.runs/${QUEST_ID}-1`,
    });
    const attemptLog = [
      entry('wren', 'assignee', 0, 'submitted'),
      entry('sable', 'verifier', 10, 'breaker'),
      entry('orin', 'verifier', 20, 'timeout'),
    ];
    await plantQuests(kingdom, questFixture('infirmary', QUEST_ID, { ...HELD, attempt_log: attemptLog }));
    const io = testIo();
    expect(await quest(io, 'retry', QUEST_ID)).toBe(0);
    expect(io.printed.out[0]).toMatch(
      new RegExp(`^Sent the command to retry quest ${QUEST_ID}: its review goes on with a new judge`),
    );
  });

  it('leaves the choice to the Steward without --to, and names the character with it', async () => {
    await plantQuests(kingdom, questFixture('infirmary'), questFixture('returned', OTHER_QUEST_ID, HELD));
    await summon('kael', '--class', 'knight', '--level', '5');
    const io = testIo();
    expect(await quest(io, 'reassign', QUEST_ID)).toBe(0);
    expect(io.printed.out[0]).toBe(
      `Sent the command to give quest ${QUEST_ID} to someone else: the Steward picks among the free characters of its class.`,
    );
    const named = testIo();
    expect(await quest(named, 'reassign', OTHER_QUEST_ID, '--to', 'kael')).toBe(0);
    // Level 5 takes up to C: a rank D quest needs no seal, so nothing more is said.
    expect(named.printed.out).toHaveLength(2);
    expect(named.printed.out[0]).toBe(`Sent the command to give quest ${OTHER_QUEST_ID} to kael.`);
    expect(await sent()).toEqual([
      { kind: 'reassign', payload: { quest: QUEST_ID } },
      { kind: 'reassign', payload: { quest: OTHER_QUEST_ID, character: 'kael' } },
    ]);
  });

  it('says when the character is below the rank: the quest then waits for the seal', async () => {
    await plantQuests(kingdom, questFixture('open', QUEST_ID, { rank: 'B' }));
    await summon('ember', '--class', 'knight', '--level', '1');
    const io = testIo();
    expect(await quest(io, 'reassign', QUEST_ID, '--to', 'ember')).toBe(0);
    expect(io.printed.out.at(-1)).toBe(
      'ember is level 1 and is given up to rank F: this rank B quest waits for your royal seal when done.',
    );
  });

  it('refuses a quest no one can be given now, and a character the Steward would refuse', async () => {
    await plantQuests(kingdom, questFixture('working', QUEST_ID, HELD), questFixture('open', OTHER_QUEST_ID));
    await summon('quill', '--class', 'scribe');
    await summon('thorn', '--class', 'knight');
    const store = openKingdom(kingdom);
    const thorn = await store.characters.read('thorn' as CharacterId);
    if (!thorn.ok) throw new Error('thorn');
    await store.characters.write({ ...thorn.value, status: 'suspended' });
    const working = testIo();
    expect(await quest(working, 'reassign', QUEST_ID, '--to', 'thorn')).toBe(1);
    expect(working.printed.err[0]).toMatch(/^Quest q_20261106_7k3m2a is «Working»: only an open quest/);
    const errors = async (to: string) => {
      const io = testIo();
      expect(await quest(io, 'reassign', OTHER_QUEST_ID, '--to', to)).toBe(1);
      return io.printed.err;
    };
    expect(await errors('nobody')).toEqual(['There is no character nobody. See: elvaria character list']);
    expect(await errors('Not An Id')).toEqual([
      'There is no character Not An Id. See: elvaria character list',
    ]);
    expect(await errors('quill')).toEqual([`quill is a Scribe; quest ${OTHER_QUEST_ID} needs a Knight.`]);
    expect(await errors('thorn')).toEqual(['thorn is suspended and takes no work.']);
    expect(await sent()).toEqual([]);
  });
});
