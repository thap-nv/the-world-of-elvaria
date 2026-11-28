// sendForCharacter (AH-14a): every command that hands a quest to a named character checks the character and says
// its ceiling the same way, whichever command it is; only the command sent differs.
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { QUEST_ID, plantQuests, questFixture } from '../__fixtures__/quest.ts';
import type { TempDir } from '../__fixtures__/cli.ts';
import type { QuestStatus } from '@elvaria/domain';

// The infirmary keeps who held the quest; a draft or an open quest has no one yet.
const HELD = { assignee: 'wren', attempts: 1 };

const CASES: readonly {
  verb: string;
  status: QuestStatus;
  held?: Record<string, unknown>;
  sent: string;
  command: object;
}[] = [
  {
    verb: 'confirm',
    status: 'draft',
    sent: `Sent the command to confirm quest ${QUEST_ID} and give it to ember.`,
    command: { kind: 'confirm', payload: { quest: QUEST_ID, assignee: 'ember' } },
  },
  {
    verb: 'reassign',
    status: 'open',
    sent: `Sent the command to give quest ${QUEST_ID} to ember.`,
    command: { kind: 'reassign', payload: { quest: QUEST_ID, character: 'ember' } },
  },
  {
    verb: 'retry',
    status: 'infirmary',
    held: HELD,
    sent: `Sent the command to retry quest ${QUEST_ID} with ember: only it takes the quest, with its full attempt budget (reassign command).`,
    command: { kind: 'reassign', payload: { quest: QUEST_ID, character: 'ember' } },
  },
];

describe('a quest handed to a named character (quest confirm|reassign|retry --to)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await run(testIo(), 'character', 'add', 'quill', '--class', 'scribe', '--kingdom', kingdom);
    await run(
      testIo(),
      'character',
      'add',
      'ember',
      '--class',
      'knight',
      '--level',
      '1',
      '--kingdom',
      kingdom,
    );
  });
  afterEach(() => dir.remove());

  const quest = (io: ReturnType<typeof testIo>, ...args: string[]) =>
    run(io, 'quest', ...args, '--kingdom', kingdom, '--locale', 'en');
  const sent = async () =>
    (await openKingdom(kingdom).inbox.read()).flatMap(({ command }) =>
      command.ok ? [{ kind: command.value.kind, payload: command.value.payload }] : [],
    );

  it.each(CASES)(
    '$verb --to refuses the character alike, sending nothing',
    async ({ verb, status, held }) => {
      await plantQuests(kingdom, questFixture(status, QUEST_ID, held));
      for (const [to, line] of [
        ['nobody', 'There is no character nobody. See: elvaria character list'],
        ['quill', 'quill is a Scribe; the quest needs a Knight.'],
      ] as const) {
        const io = testIo();
        expect(await quest(io, verb, QUEST_ID, '--to', to)).toBe(1);
        expect(io.printed.err).toEqual([line]);
      }
      expect(await sent()).toEqual([]);
    },
  );

  it.each(CASES)('$verb --to sends its command, then says the ceiling alike', async (each) => {
    await plantQuests(kingdom, questFixture(each.status, QUEST_ID, { ...each.held, rank: 'B' }));
    const io = testIo();
    expect(await quest(io, each.verb, QUEST_ID, '--to', 'ember')).toBe(0);
    expect(io.printed.out[0]).toBe(each.sent);
    expect(io.printed.out.at(-1)).toBe(
      'ember is level 1 and is given up to rank F: this rank B quest waits for your royal seal when done.',
    );
    expect(await sent()).toEqual([each.command]);
  });
});
