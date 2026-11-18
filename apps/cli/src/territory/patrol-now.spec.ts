// A red default branch in the owner's words (PS-09d): `territory patrol --now` asks the Steward for one patrol through
// the inbox, for a patrolled territory only; `quest list` and `quest show` mark the open quests that wait for the
// branch to be green, never the patrol's fix nor a quest already claimed; the digest says the territory takes no work.
// Turning the patrol off is a way out: an unpatrolled territory is never red.
import path from 'node:path';

import { EVENT_VERSION, EventSchema } from '@elvaria/domain';
import type { InboxCommand } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, gitRepo, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir } from '../../test/cli.ts';

const FIX_ID = 'q_20261106_9p5q4c';
const SHA = 'abcdef1234567890abcdef1234567890abcdef12';
const MARK = 'waits for a green base branch';

const redPatrol = EventSchema.parse({
  v: EVENT_VERSION,
  id: '01JCF8X4Z6Q3W9N2M5R7T8V001',
  ts: '2026-11-06T06:30:00+07:00',
  type: 'patrol.ran',
  actor: { kind: 'steward' },
  data: {
    territory: 'elvaria',
    head: SHA,
    trigger: 'schedule',
    setup: null,
    checks: [
      {
        id: 'unit',
        pass: false,
        duration_ms: 1000,
        timed_out: false,
        environment: false,
        error_line: 'FAIL src/a.spec.ts',
        log_path: '.runs/patrol-elvaria/checks/unit.log',
      },
    ],
    scans: [],
  },
});

describe('a red default branch at the terminal', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    const repo = await gitRepo(path.join(dir.root, 'repo elvaria'));
    const io = testIo();
    if ((await run(io, 'territory', 'add', repo, '--id', 'elvaria', '--kingdom', kingdom)) !== 0)
      throw new Error(printed(io));
  });
  afterEach(() => dir.remove());

  const cli = async (...args: string[]) => {
    const io = testIo();
    const code = await run(io, ...args, '--kingdom', kingdom, '--locale', 'en');
    return { code, text: printed(io) };
  };
  const sent = async () =>
    (await openKingdom(kingdom).inbox.read())
      .flatMap(({ command }) => (command.ok ? [command.value] : []))
      .map(({ kind, payload }: InboxCommand) => ({ kind, payload }));

  it('`--now` sends one patrol command for a patrolled territory, and refuses one the patrol does not watch', async () => {
    const off = await cli('territory', 'patrol', 'elvaria', '--now');
    expect(off.code).toBe(1);
    expect(off.text).toContain('The patrol does not watch territory elvaria');
    expect((await cli('territory', 'patrol', 'elvaria', '--now', '--on')).code).toBe(2);
    expect(await sent()).toEqual([]);

    expect((await cli('territory', 'patrol', 'elvaria', '--on')).code).toBe(0);
    const now = await cli('territory', 'patrol', 'elvaria', '--now');
    expect(now.code).toBe(0);
    expect(now.text).toContain('Sent: the Steward patrols the default branch of elvaria now');
    expect(await sent()).toEqual([{ kind: 'patrol', payload: { territory: 'elvaria' } }]);
  });

  it('marks the open quests that wait for the branch, not the patrol’s fix nor a claimed one, until the patrol is off', async () => {
    expect((await cli('territory', 'patrol', 'elvaria', '--on')).code).toBe(0);
    await openEventLog(kingdom).append([redPatrol]);
    await plantQuests(
      kingdom,
      questFixture('open', QUEST_ID, { territory: 'elvaria' }),
      questFixture('claimed', OTHER_QUEST_ID, { territory: 'elvaria', assignee: 'thorn' }),
      questFixture('open', FIX_ID, { territory: 'elvaria', created_by: 'patrol' }),
    );

    const list = await cli('quest', 'list');
    const marked = list.text.split('\n').filter((row) => row.includes(MARK));
    expect(marked).toHaveLength(1);
    expect(marked[0]).toContain(QUEST_ID);
    const why =
      'Waits for a green base branch: the latest patrol found the default branch of territory elvaria red';
    expect((await cli('quest', 'show', QUEST_ID)).text).toContain(why);
    expect((await cli('quest', 'show', FIX_ID)).text).not.toContain(why);
    expect((await cli('digest')).text).toContain(
      'The territory takes no work; quests waiting for its default branch to be green: 1.',
    );

    expect((await cli('territory', 'patrol', 'elvaria', '--off')).code).toBe(0);
    expect((await cli('quest', 'list')).text).not.toContain(MARK);
    expect((await cli('digest')).text).not.toContain('The territory takes no work');
  });
});
