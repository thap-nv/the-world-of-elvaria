// PS-12b: `elvaria metrics` over a kingdom whose scripture and event log are on disk: the sentence of a line is joined
// from the file, the counts come from the log, and the JSON names lines by ref alone.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { EVENT_VERSION, EventSchema, VerdictSchema, questViewOf } from '@elvaria/domain';
import type { Metrics } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../__fixtures__/quest.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

const REF = 'L_20261106_4k2pqz';
const SENTENCE = 'Keep the README in step with the code.';

describe('elvaria metrics over a kingdom with a scripture (PS-12b)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const QUESTS = [QUEST_ID, OTHER_QUEST_ID, 'q_20261106_9p5q4c'] as const;
  const at = (hour: number) => `2026-11-06T${String(hour).padStart(2, '0')}:00:00+07:00`;

  /** Three runs a day apart in the hours, each failed with `style` by its judge; the prompt of each carried the line. */
  async function stage(): Promise<void> {
    const quests = QUESTS.map((id, index) =>
      questFixture('archived', id, {
        attempts: 1,
        attempt_log: [
          {
            n: 1,
            character: 'thorn',
            role: 'assignee',
            started_at: at(8 + index),
            ended_at: at(9 + index),
            outcome: 'submitted',
            session_id: `s-${index}`,
            tokens: 1000,
            run_dir: `.runs/${id}-1`,
          },
        ],
      }),
    );
    await plantQuests(kingdom, ...quests);
    const store = openKingdom(kingdom);
    for (const id of QUESTS)
      await store.verdicts.write(
        VerdictSchema.parse({
          version: 1,
          id: `${id}-1`,
          quest_id: id,
          attempt: 1,
          verifier_id: 'vesper',
          ritual: 'build_review',
          checks: [],
          result: 'fail',
          fail_kind: 'style',
          notes: 'The README still names the old command.',
          by_human: false,
          session_id: `v-${id}`,
          created_at: at(20),
        }),
      );
    await openEventLog(kingdom).append(
      quests.map((quest, index) =>
        EventSchema.parse({
          v: EVENT_VERSION,
          id: `01JC${String(index + 1).padStart(22, '0')}`,
          ts: at(8 + index),
          type: 'quest.started',
          actor: { kind: 'steward' },
          quest: quest.id,
          session: `s-${index}`,
          data: {
            quest: questViewOf(quest),
            load_trace: {
              scriptures: [{ file: 'temple/scripture.md', lines: 1 }],
              lessons: [REF],
              skills: [],
              blocks: [{ part: 'user', id: 'quest', chars: 50 }],
            },
          },
        }),
      ),
    );
    await mkdir(path.join(kingdom, 'temple'), { recursive: true });
    await writeFile(
      path.join(kingdom, 'temple', 'scripture.md'),
      `# Scripture\n\n- [${REF}] {fail_kind=style} ${SENTENCE}\n`,
      'utf8',
    );
  }

  it('prints the line with its counts and sentence, the kind with its rate, and the failure that repeats', async () => {
    await stage();
    const io = testIo();
    expect(await run(io, 'metrics', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    const text = printed(io);
    // Three runs loaded the line and all three failed with the kind it cures: three misses, too few runs to judge it.
    expect(text).toMatch(
      new RegExp(
        `${REF}\\s+style\\s+3\\s+0\\s+3\\s+too early \\(3/20 runs\\)\\s+2026-11-06\\s+2026-11-06\\s+${SENTENCE}`,
      ),
    );
    expect(text).toMatch(/style\s+3\s+3\/3/);
    expect(text).toMatch(new RegExp(`style\\s+3\\s+${QUEST_ID}-1, ${OTHER_QUEST_ID}-1, q_20261106_9p5q4c-1`));
  });

  it('keeps the sentence out of the JSON, which names lines by ref', async () => {
    await stage();
    const io = testIo();
    expect(await run(io, 'metrics', '--json', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    const metrics = JSON.parse(io.printed.out.join('\n')) as Metrics;
    expect(metrics.lessons.map(({ ref, loads, missed }) => [ref, loads, missed])).toEqual([[REF, 3, 3]]);
    expect(io.printed.out.join('\n')).not.toContain(SENTENCE);
  });

  it('prints the three tables empty, in their own words, for a kingdom with no history', async () => {
    const io = testIo();
    expect(await run(io, 'metrics', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    const text = printed(io);
    expect(text).toContain('No session has written a per-line load trace yet');
    expect(text).toContain('No run has been judged yet, or none failed.');
    expect(text).toContain('No failure repeats: no kind has 3 verdicts among the last 50 judged runs.');
  });
});
