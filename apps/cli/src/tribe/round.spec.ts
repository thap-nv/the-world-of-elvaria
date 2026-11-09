// P1-19 "xong khi" (implementation-plan §8, §3.14): an owner adapter file with a fake CLI and no tool gate passes
// the conformance suite, then `elvaria run` loads it with createAdapter(kit) and takes a quest of rank D all the way
// round — worked, judged by another character of the tribe, done — while a quest of rank C waits: tribeLimitsOf
// keeps a tribe without a tool gate to ranks F–D, whatever its characters' levels.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { openEventLog } from '@elvaria/eventlog';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { FAKE_LANTERN, LANTERN_ADAPTER, editKingdom, installLantern } from '../../test/lantern.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

const SMALL = 'Write the changelog entry';
const LARGE = 'Rework the release pipeline';
/** How long the round may take: a few Node starts per session, one tick a second. */
const ROUND_MS = 90_000;
const POLL_MS = 100;

describe('a quest round with an owner adapter file', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const elvaria = async (io: TestIo, ...args: string[]) => {
    const code = await run(io, ...args, '--kingdom', kingdom, '--locale', 'en');
    if (code !== 0) throw new Error(`elvaria ${args.join(' ')} → ${String(code)}: ${printed(io)}`);
  };
  const quests = async () => (await openKingdom(kingdom).quests.list()).items;
  const questTitled = async (title: string) => (await quests()).find((quest) => quest.title === title);

  /** Holds `elvaria run` until the small quest is done, sealing it as the owner would once it waits; or gives up. */
  const untilDone = async () => {
    const deadline = Date.now() + ROUND_MS;
    let sealed = false;
    while (Date.now() < deadline) {
      const small = await questTitled(SMALL);
      if (small?.status === 'done') return;
      if (small?.status === 'awaiting_seal' && !sealed) {
        await elvaria(testIo(), 'seal', small.id);
        sealed = true;
      }
      await sleep(POLL_MS);
    }
  };

  it(
    'loads the file, takes the rank D quest round and leaves the rank C quest open',
    { timeout: ROUND_MS + 30_000 },
    async () => {
      // §3.14 "thêm tộc sau khi vương quốc đã dựng": add, pin, check; the two built-in tribes stay out of it.
      await installLantern(kingdom);
      await elvaria(testIo(), 'tribe', 'disable', 'claude');
      await elvaria(testIo(), 'tribe', 'disable', 'gemini');
      await elvaria(testIo(), 'tribe', 'add', 'lantern', '--adapter', LANTERN_ADAPTER);
      await run(testIo(), 'doctor', '--tool', `lantern=${FAKE_LANTERN}`, '--kingdom', kingdom);
      await elvaria(testIo(), 'tribe', 'check', 'lantern', '--scenarios');
      // A knight high enough for rank C, and a judge on another model of the same family (different_model).
      const summon = ['--tribe', 'lantern'];
      await elvaria(
        testIo(),
        'character',
        'add',
        'wick',
        '--class',
        'knight',
        ...summon,
        '--model',
        'lantern-small',
        '--level',
        '8',
      );
      await elvaria(
        testIo(),
        'character',
        'add',
        'lumen',
        '--class',
        'judge',
        ...summon,
        '--model',
        'lantern-large',
        '--level',
        '6',
      );
      const folder = path.join(dir.root, 'release');
      await mkdir(folder);
      await elvaria(testIo(), 'territory', 'add', folder);
      const quest = (title: string, rank: string) =>
        elvaria(
          testIo(),
          'quest',
          'add',
          '--title',
          title,
          '--description',
          title,
          '--territory',
          'release',
          '--kind',
          'build',
          '--rank',
          rank,
          '--class',
          'knight',
        );
      await quest(SMALL, 'D');
      await quest(LARGE, 'C');
      await editKingdom(kingdom, (value) => ({
        ...value,
        dispatch: { ...(value.dispatch as object), tick_seconds: 1 },
      }));

      const io = testIo({ untilStopped: untilDone });
      expect(await run(io, 'run', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
      expect(io.printed.out[0]).toBe('Tribe lantern: adapter adapters/lantern.mjs ready.');

      const small = await questTitled(SMALL);
      expect(small).toMatchObject({ status: 'done', assignee: 'wick', verifier: 'lumen' });
      // One session each, both handed in: the work, then the verdict (a pass, or the quest would not be done).
      expect(small?.attempt_log.map(({ role, outcome }) => [role, outcome])).toEqual([
        ['assignee', 'submitted'],
        ['verifier', 'submitted'],
      ]);
      expect(small?.seal).toBeDefined();
      // Level 8 takes rank C; the tribe without a tool gate does not.
      expect(await questTitled(LARGE)).toMatchObject({ status: 'open', assignee: null });
      // Without events the adapter writes only the start and the end of each session (§3.14).
      const log = await openEventLog(kingdom).read();
      expect(log.issues).toEqual([]);
      const sessions = log.events.filter(({ type }) => type.startsWith('agent.'));
      expect(sessions.map(({ type }) => type)).toEqual([
        'agent.session.start',
        'agent.session.end',
        'agent.session.start',
        'agent.session.end',
      ]);
    },
  );
});
