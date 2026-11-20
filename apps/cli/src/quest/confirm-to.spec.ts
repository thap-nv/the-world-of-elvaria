// `elvaria quest confirm --to`: the draft opens for the character named, in the one confirm command, so no tick
// between a confirm and a reassign can give it to another (q_20261120_tpzvk5).
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir } from '../../test/cli.ts';

describe('elvaria quest confirm --to', () => {
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

  it('names the character in the confirm command itself, not in a reassign', async () => {
    await plantQuests(kingdom, questFixture('draft'), questFixture('draft', OTHER_QUEST_ID, { rank: 'B' }));
    await summon('kael', '--class', 'knight', '--level', '5');
    await summon('ember', '--class', 'knight', '--level', '1');
    const io = testIo();
    expect(await quest(io, 'confirm', QUEST_ID, '--to', 'kael')).toBe(0);
    // Level 5 takes up to C: a rank D quest needs no seal, so nothing more is said.
    expect(io.printed.out).toEqual([`Sent the command to confirm quest ${QUEST_ID} and give it to kael.`]);
    const below = testIo();
    expect(await quest(below, 'confirm', OTHER_QUEST_ID, '--to', 'ember')).toBe(0);
    expect(below.printed.out.at(-1)).toBe(
      'ember is level 1 and is given up to rank F: this rank B quest waits for your royal seal when done.',
    );
    expect(await sent()).toEqual([
      { kind: 'confirm', payload: { quest: QUEST_ID, assignee: 'kael' } },
      { kind: 'confirm', payload: { quest: OTHER_QUEST_ID, assignee: 'ember' } },
    ]);
  });

  it('refuses a character the Steward would refuse, and a quest that is no draft, sending nothing', async () => {
    await plantQuests(kingdom, questFixture('draft'), questFixture('open', OTHER_QUEST_ID));
    await summon('quill', '--class', 'scribe');
    await summon('kael', '--class', 'knight');
    const errors = async (id: string, to: string) => {
      const io = testIo();
      expect(await quest(io, 'confirm', id, '--to', to)).toBe(1);
      return io.printed.err;
    };
    expect(await errors(QUEST_ID, 'nobody')).toEqual([
      'There is no character nobody. See: elvaria character list',
    ]);
    expect(await errors(QUEST_ID, 'quill')).toEqual(['quill is a Scribe; the quest needs a Knight.']);
    expect(await errors(OTHER_QUEST_ID, 'kael')).toEqual([
      `Quest ${OTHER_QUEST_ID} is «Open»: only a draft needs confirming.`,
    ]);
    expect(await sent()).toEqual([]);
  });
});
