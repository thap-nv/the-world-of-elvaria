import path from 'node:path';

import { QuestIdSchema, TerritorySchema, TribeIdSchema, createIdSource } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { createFakeRunner, openFileTreasury } from '@elvaria/runner-core';
import { createSteward, folderPlots } from '@elvaria/steward';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TZ, foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';
import type { InboxCommand, Quest } from '@elvaria/domain';

const ASKED_SESSION = 'fake-claude-asked';
const QUESTION = 'Should the release notes go on main or on the release branch?';
const ANSWER = 'On the release branch.';

/** Thorn's quest, blocked on its question since `askedAt`; the test clock reads 09:00 (+07:00). */
const blockedSince = (askedAt: string): Quest =>
  questFixture('blocked', QUEST_ID, {
    assignee: 'thorn',
    attempts: 1,
    blocked: { question: QUESTION, asked_at: askedAt },
    attempt_log: [
      {
        n: 1,
        character: 'thorn',
        role: 'assignee',
        started_at: '2026-11-06T06:00:00+07:00',
        ended_at: askedAt,
        outcome: 'blocked',
        session_id: ASKED_SESSION,
        run_dir: `.runs/${QUEST_ID}-1`,
      },
    ],
  });

describe('elvaria answer', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const elvaria = (io: TestIo, ...args: string[]) => run(io, ...args, '--kingdom', kingdom, '--locale', 'en');
  const inbox = async (): Promise<InboxCommand[]> =>
    (await openKingdom(kingdom).inbox.read()).flatMap((item) =>
      item.command.ok ? [item.command.value] : [],
    );

  /** The territory and the asker a session needs: the Steward opens one for the answer. */
  async function stage(quest: Quest): Promise<void> {
    await openKingdom(kingdom).territories.write(
      TerritorySchema.parse({
        version: 1,
        id: 'do-an',
        name: 'do-an',
        path: path.join(dir.root, 'do-an').replaceAll('\\', '/'),
        kind: 'code',
        vcs: { type: 'git', default_branch: 'main' },
        commands: {},
        checks: [],
        laws: { forbidden_paths: [], forbidden_commands: [] },
        secrets_allowed: [],
      }),
    );
    expect(await elvaria(testIo(), 'character', 'add', 'thorn', '--class', 'knight')).toBe(0);
    await plantQuests(kingdom, quest, questFixture('open', OTHER_QUEST_ID));
  }

  /** One tick of a Steward whose Claude runner is a FakeRunner; its sessions run until the Steward stops. */
  async function stewardTick() {
    const io = testIo();
    const ids = createIdSource({ clock: io.clock, random: io.random, tz: TZ });
    if (!ids.ok) throw new Error('fixture: tz');
    const fake = createFakeRunner({ scenarioOf: () => 'hang' });
    const store = openKingdom(kingdom);
    const steward = createSteward({
      store,
      events: openEventLog(store.root),
      runners: { [TribeIdSchema.parse('claude')]: fake },
      plots: folderPlots(store.root),
      env: {},
      treasury: openFileTreasury(path.join(dir.root, 'no-treasury.json')),
      clock: io.clock,
      ids: ids.value,
      bell: { ring: () => Promise.resolve() },
      log: {
        warn: (message) => {
          io.err(message);
        },
      },
    });
    expect(await steward.start({ loop: false })).toEqual({ ok: true });
    const report = await steward.tick();
    const quest = await store.quests.read(QuestIdSchema.parse(QUEST_ID));
    await steward.stop();
    if (!quest.ok) throw new Error(quest.error.message);
    expect(io.printed.err).toEqual([]);
    return { report, quest: quest.value, request: fake.requests.at(-1) };
  }

  it('sends the answer of a blocked quest to the inbox, trimmed', async () => {
    await stage(blockedSince('2026-11-06T08:30:00+07:00'));
    const io = testIo();
    expect(await elvaria(io, 'answer', QUEST_ID, `  ${ANSWER}\n`)).toBe(0);
    expect(io.printed.out[0]).toBe(`Sent your answer to quest ${QUEST_ID}.`);
    expect(io.printed.out[1]).toMatch(/^Command \S+ is in the inbox/);
    expect((await inbox()).map(({ kind, source, payload }) => ({ kind, source, payload }))).toEqual([
      { kind: 'answer', source: 'cli', payload: { quest: QUEST_ID, answer: ANSWER } },
    ]);
  });

  it('goes on in the asking session when the answer comes within resume_after_answer_minutes', async () => {
    await stage(blockedSince('2026-11-06T08:30:00+07:00'));
    expect(await elvaria(testIo(), 'answer', QUEST_ID, ANSWER)).toBe(0);
    const { report, quest, request } = await stewardTick();
    expect(report.commands.rejected).toBe(0);
    expect(quest).toMatchObject({ status: 'working', attempts: 1, blocked: { answer: ANSWER } });
    expect(quest.attempt_log.map(({ n, session_id }) => [n, session_id])).toEqual([
      [1, ASKED_SESSION],
      [1, ASKED_SESSION],
    ]);
    expect(request?.resume).toEqual({ session_id: ASKED_SESSION });
    expect(request?.prompt.user).toContain(`The owner answered: ${ANSWER}`);
  });

  it('goes on in a fresh session from the letter when the answer comes later', async () => {
    await stage(blockedSince('2026-11-06T07:00:00+07:00'));
    expect(await elvaria(testIo(), 'answer', QUEST_ID, ANSWER)).toBe(0);
    const { quest, request } = await stewardTick();
    expect(quest).toMatchObject({ status: 'working', attempts: 1, blocked: { answer: ANSWER } });
    expect(quest.attempt_log.map(({ n }) => n)).toEqual([1, 1]);
    expect(quest.attempt_log[1]?.session_id).not.toBe(ASKED_SESSION);
    expect(request?.resume).toBeUndefined();
    expect(request?.prompt.user).toContain(`The owner answered: ${ANSWER}`);
  });

  it('refuses a quest that waits for no answer, and one that does not exist, sending nothing', async () => {
    await stage(blockedSince('2026-11-06T08:30:00+07:00'));
    const io = testIo();
    expect(await elvaria(io, 'answer', OTHER_QUEST_ID, ANSWER)).toBe(1);
    expect(await elvaria(io, 'answer', 'q_20261106_zzzzzz', ANSWER)).toBe(1);
    expect(io.printed.err).toEqual([
      `Quest ${OTHER_QUEST_ID} is «Open»: only a quest waiting for your answer can be answered.`,
      expect.stringContaining('q_20261106_zzzzzz') as string,
    ]);
    expect(await inbox()).toEqual([]);
  });

  it('asks for an answer with words in it before opening the kingdom', async () => {
    const blank = testIo();
    expect(await elvaria(blank, 'answer', QUEST_ID, '   ')).toBe(2);
    expect(blank.printed.err).toEqual(['Give an answer: elvaria answer <quest> "<your answer>".']);
    const missing = testIo();
    expect(await elvaria(missing, 'answer', QUEST_ID)).toBe(2);
    expect(missing.printed.err[0]).toContain('<answer>');
    expect(await inbox()).toEqual([]);
  });
});
