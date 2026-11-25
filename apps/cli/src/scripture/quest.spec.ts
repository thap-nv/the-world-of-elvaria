import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { EVENT_VERSION, EventSchema, questViewOf } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { QUEST_ID, plantQuests, questFixture } from '../__fixtures__/quest.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

const REF = 'L_20261119_4k2pqz';
const GONE = 'T_0123456789';
const at = (hour: number) => `2026-11-19T${hour}:00:00+07:00`;

describe('scripture list --quest', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  async function list(id = QUEST_ID, ...options: string[]) {
    const io = testIo();
    const code = await run(
      io,
      'scripture',
      'list',
      '--quest',
      id,
      '--kingdom',
      kingdom,
      '--locale',
      'en',
      ...options,
    );
    return { code, out: io.printed.out, err: io.printed.err };
  }

  async function stage(): Promise<void> {
    const quest = questFixture('working', QUEST_ID, {
      assignee: 'thorn',
      attempts: 1,
      attempt_log: [
        {
          n: 1,
          character: 'thorn',
          role: 'assignee',
          started_at: at(10),
          session_id: 's1',
          tokens: 0,
          run_dir: `.runs/${QUEST_ID}-1`,
        },
      ],
    });
    await plantQuests(kingdom, quest);
    const opening = (hour: number, type: string, session: string, lessons?: string[]) =>
      EventSchema.parse({
        v: EVENT_VERSION,
        id: `01JC${String(hour).padStart(22, '0')}`,
        ts: at(hour),
        type,
        actor: { kind: 'steward' },
        quest: QUEST_ID,
        session,
        data: {
          quest: questViewOf(hour === 11 ? { ...quest, status: 'review', verifier: quest.assignee } : quest),
          load_trace: {
            scriptures: [],
            skills: [],
            blocks: [{ part: 'user', id: 'quest', chars: 50 }],
            ...(lessons === undefined ? {} : { lessons }),
          },
        },
      });
    await openJournal(kingdom, QUEST_ID).append([
      opening(12, 'quest.resumed', 's1'),
      opening(10, 'quest.started', 's1', [GONE, REF]),
      opening(11, 'quest.unblocked', 's2', [REF]),
    ]);
    await mkdir(path.join(kingdom, 'temple'), { recursive: true });
    await writeFile(
      path.join(kingdom, 'temple/scripture.md'),
      `- [${REF}] Current sentence.\n- Never loaded.\n`,
      'utf8',
    );
  }

  it('prints each opening chronologically, retaining loaded refs and showing current text only', async () => {
    await stage();
    const result = await list();
    expect(result.code).toBe(0);
    expect(result.err).toEqual([]);
    expect(result.out).toEqual([
      'Loaded refs come from the session history; sentences show the current scripture.',
      'Session s1 · attempt 1 · assignee · thorn · 2026-11-19T10:00:00+07:00',
      '  T_0123456789: text no longer available in the current scripture',
      '  L_20261119_4k2pqz: Current sentence.',
      'Session s2 · attempt 1 · verifier · thorn · 2026-11-19T11:00:00+07:00',
      '  L_20261119_4k2pqz: Current sentence.',
      'Session s1 · attempt 1 · assignee · thorn · 2026-11-19T12:00:00+07:00',
      '  No lessons recorded as loaded.',
    ]);
  });

  it('reports a quest without sessions', async () => {
    await plantQuests(kingdom, questFixture('draft'));
    expect(await list()).toEqual({
      code: 0,
      out: [`Quest ${QUEST_ID} has no sessions yet.`],
      err: [],
    });
  });

  it('shows old attempt entries even when no opening trace remains', async () => {
    await plantQuests(
      kingdom,
      questFixture('draft', QUEST_ID, {
        attempt_log: [
          {
            n: 1,
            character: 'thorn',
            role: 'assignee',
            started_at: at(10),
            session_id: 'old',
            run_dir: `.runs/${QUEST_ID}-1`,
          },
        ],
      }),
    );
    const result = await list();
    expect(result.code).toBe(0);
    expect(result.out.slice(1)).toEqual([
      'Session old · attempt 1 · assignee · thorn · 2026-11-19T10:00:00+07:00',
      '  No lessons recorded as loaded.',
    ]);
  });

  it('rejects missing and malformed ids', async () => {
    for (const id of [QUEST_ID, '../outside']) {
      const result = await list(id);
      expect(result.code).toBe(1);
      expect(result.out).toEqual([]);
      expect(result.err.join('\n')).toContain(id);
    }
  });

  it('rejects combining quest and character', async () => {
    expect(await list(QUEST_ID, '--character', 'thorn')).toEqual({
      code: 2,
      out: [],
      err: ['Use either --quest or --character.'],
    });
  });

  it('does not turn a corrupt journal into an empty history', async () => {
    await plantQuests(kingdom, questFixture('draft'));
    const journal = openJournal(kingdom, QUEST_ID);
    await mkdir(path.dirname(journal.file), { recursive: true });
    await writeFile(journal.file, 'not json\n', 'utf8');
    expect(await list()).toEqual({
      code: 1,
      out: [],
      err: [`Cannot read the session history of quest ${QUEST_ID}: its journal contains invalid lines.`],
    });
  });
});
