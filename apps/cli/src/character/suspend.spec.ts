import { CharacterIdSchema, CharacterSchema } from '@elvaria/domain';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID } from '../../test/quest.ts';
import type { TempDir } from '../../test/cli.ts';

describe('elvaria character suspend, release (after P1-26)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await run(testIo(), 'character', 'add', 'thorn', '--class', 'knight', '--kingdom', kingdom);
  });
  afterEach(() => dir.remove());

  const character = (io: ReturnType<typeof testIo>, ...args: string[]) =>
    run(io, 'character', ...args, '--kingdom', kingdom, '--locale', 'en');
  const sent = async () =>
    (await openKingdom(kingdom).inbox.read()).flatMap(({ command }) =>
      command.ok ? [{ kind: command.value.kind, payload: command.value.payload }] : [],
    );
  /** Rewrites thorn as the Steward would have left it. */
  const thornAs = async (fields: Readonly<Record<string, unknown>>) => {
    const store = openKingdom(kingdom);
    const thorn = await store.characters.read(CharacterIdSchema.parse('thorn'));
    if (!thorn.ok) throw new Error('thorn');
    const written = await store.characters.write(CharacterSchema.parse({ ...thorn.value, ...fields }));
    if (!written.ok) throw new Error(written.error.message);
  };

  it('suspends an idle character with its reason, and releases it once suspended', async () => {
    const io = testIo();
    expect(await character(io, 'suspend', 'thorn', '--reason', 'trial over')).toBe(0);
    expect(io.printed.out[0]).toBe(
      'Sent the command to suspend thorn: it takes no work until elvaria character release thorn.',
    );
    expect(io.printed.out).toHaveLength(2);
    await thornAs({ status: 'suspended' });
    const released = testIo();
    expect(await character(released, 'release', 'thorn')).toBe(0);
    expect(released.printed.out[0]).toBe('Sent the command to release thorn: it takes work again.');
    expect(await sent()).toEqual([
      { kind: 'suspend', payload: { character: 'thorn', reason: 'trial over' } },
      { kind: 'release', payload: { character: 'thorn' } },
    ]);
  });

  it('says what becomes of the quest the character works on or judges', async () => {
    await thornAs({ status: 'working', current: { quest: QUEST_ID, role: 'assignee' } });
    const working = testIo();
    expect(await character(working, 'suspend', 'thorn')).toBe(0);
    expect(working.printed.out.at(-1)).toBe(
      `Quest ${QUEST_ID} goes on without it (see elvaria quest show ${QUEST_ID}); elvaria quest reassign ${QUEST_ID} gives it to someone else.`,
    );
    await thornAs({ status: 'reviewing', current: { quest: OTHER_QUEST_ID, role: 'verifier' } });
    const judging = testIo();
    expect(await character(judging, 'suspend', 'thorn')).toBe(0);
    expect(judging.printed.out.at(-1)).toBe(
      `The Steward stops its review of quest ${OTHER_QUEST_ID}; the next judge takes it.`,
    );
  });

  it('refuses an unknown character, a second suspend and a release of one not suspended', async () => {
    const unknown = testIo();
    expect(await character(unknown, 'suspend', 'nobody')).toBe(1);
    expect(unknown.printed.err).toEqual(['There is no character nobody. See: elvaria character list']);
    const idle = testIo();
    expect(await character(idle, 'release', 'thorn')).toBe(1);
    expect(idle.printed.err).toEqual(['thorn is «Idle», not suspended: there is nothing to release.']);
    await thornAs({ status: 'suspended' });
    const again = testIo();
    expect(await character(again, 'suspend', 'thorn')).toBe(1);
    expect(again.printed.err).toEqual([
      'thorn is suspended already; elvaria character release thorn brings it back.',
    ]);
    expect(await sent()).toEqual([]);
  });
});
