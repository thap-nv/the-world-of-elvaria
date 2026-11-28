// questUnless and namedQuest (AH-14a): a quest command refuses an unknown quest, and a quest where it stands, with
// the same lines whichever command it is, before anything is sent.
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { QUEST_ID, plantQuests, questFixture } from '../__fixtures__/quest.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

describe('the quest a command names (questUnless, namedQuest)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const refused = async (...args: string[]) => {
    const io = testIo();
    expect(await run(io, 'quest', ...args, '--kingdom', kingdom, '--locale', 'en')).toBe(1);
    expect((await openKingdom(kingdom).inbox.read()).length).toBe(0);
    return io.printed.err;
  };

  it.each([
    { verb: 'deliver', line: `Quest ${QUEST_ID} is Open: only a done quest goes to the forge.` },
    {
      verb: 'submit',
      line: `Quest ${QUEST_ID} is Open: only a quest in the infirmary goes to review this way.`,
    },
    { verb: 'confirm', line: `Quest ${QUEST_ID} is «Open»: only a draft needs confirming.` },
    { verb: 'unhold', line: `Quest ${QUEST_ID} is not held.` },
  ])('quest $verb refuses an open quest, naming it and its status', async ({ verb, line }) => {
    await plantQuests(kingdom, questFixture('open'));
    expect(await refused(verb, QUEST_ID)).toEqual([line]);
  });

  it('names the status of a quest that cannot be held', async () => {
    await plantQuests(kingdom, questFixture('done'));
    expect(await refused('hold', QUEST_ID)).toEqual([
      `Quest ${QUEST_ID} is Done: only an open quest, or one claimed and not started yet, can be held.`,
    ]);
  });

  it.each(['show', 'deliver', 'escaped', 'hold', 'confirm', 'submit'])(
    'quest %s refuses an unknown quest, and an id that is none, with the same line',
    async (verb) => {
      expect(await refused(verb, 'q_20261106_9z9z9z')).toEqual(['There is no quest q_20261106_9z9z9z.']);
      expect(await refused(verb, 'not-a-quest')).toEqual(['There is no quest not-a-quest.']);
    },
  );
});
