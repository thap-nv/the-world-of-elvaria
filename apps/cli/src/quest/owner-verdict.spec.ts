import path from 'node:path';

import { QuestIdSchema, VerdictIdSchema, createIdSource } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { openFileTreasury } from '@elvaria/runner-core';
import { createSteward, folderPlots } from '@elvaria/steward';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir } from '../../test/cli.ts';
import type { InboxCommand } from '@elvaria/domain';

const WAITING = {
  assignee: 'thorn',
  attempts: 1,
  seal_required: true,
  attempt_log: [
    {
      n: 1,
      character: 'thorn',
      role: 'assignee',
      started_at: '2026-11-06T09:00:00+07:00',
      ended_at: '2026-11-06T09:40:00+07:00',
      outcome: 'submitted',
      run_dir: `.runs/${QUEST_ID}-1`,
    },
  ],
};
/** Ids the way the CLI makes them (kingdom-context.ts), on the fixture's zone. */
function idsOf(io: ReturnType<typeof testIo>) {
  const ids = createIdSource({ clock: io.clock, random: io.random, tz: 'Asia/Ho_Chi_Minh' });
  if (!ids.ok) throw new Error('fixture: tz');
  return ids.value;
}

const NOTE = 'The order total must round half up, see docs/pricing.md.';

describe('elvaria seal, return', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await plantQuests(
      kingdom,
      questFixture('awaiting_seal', QUEST_ID, WAITING),
      questFixture('open', OTHER_QUEST_ID),
    );
  });
  afterEach(() => dir.remove());

  const elvaria = (io: ReturnType<typeof testIo>, ...args: string[]) =>
    run(io, ...args, '--kingdom', kingdom, '--locale', 'en');
  const inbox = async (): Promise<InboxCommand[]> =>
    (await openKingdom(kingdom).inbox.read()).flatMap((item) =>
      item.command.ok ? [item.command.value] : [],
    );

  it('seals work waiting for the seal, with or without a note', async () => {
    const io = testIo();
    expect(await elvaria(io, 'seal', QUEST_ID, '--note', 'Clean work.')).toBe(0);
    expect(io.printed.out[0]).toBe(`Sent the command to seal quest ${QUEST_ID}.`);
    expect(await elvaria(testIo(), 'seal', QUEST_ID)).toBe(0);
    expect((await inbox()).map(({ kind, payload }) => ({ kind, payload }))).toEqual([
      { kind: 'seal', payload: { quest: QUEST_ID, note: 'Clean work.' } },
      { kind: 'seal', payload: { quest: QUEST_ID } },
    ]);
  });

  it('ends the quest once the Steward applies the seal sent from the terminal', async () => {
    expect(await elvaria(testIo(), 'character', 'add', 'thorn', '--class', 'knight')).toBe(0);
    expect(await elvaria(testIo(), 'seal', QUEST_ID)).toBe(0);
    const store = openKingdom(kingdom);
    const io = testIo();
    const steward = createSteward({
      store,
      events: openEventLog(store.root),
      runners: {},
      plots: folderPlots(store.root),
      // No session opens here, so no env and no secret is needed (P1-10).
      env: {},
      treasury: openFileTreasury(path.join(dir.root, 'no-treasury.json')),
      clock: io.clock,
      ids: idsOf(io),
      bell: { ring: () => Promise.resolve() },
      log: {
        warn: (message) => {
          io.err(message);
        },
      },
    });
    expect(await steward.start({ loop: false })).toEqual({ ok: true });
    await steward.tick();
    await steward.stop();
    const sealed = await store.quests.read(QuestIdSchema.parse(QUEST_ID));
    expect(sealed).toMatchObject({ ok: true, value: { status: 'done', seal: {} } });
    const verdict = await store.verdicts.read(VerdictIdSchema.parse(`${QUEST_ID}-1-user`));
    expect(verdict).toMatchObject({ ok: true, value: { verifier_id: 'user', result: 'pass' } });
    expect(io.printed.err).toEqual([]);
  });

  it('refuses to seal or return a quest that does not wait for the seal', async () => {
    const io = testIo();
    expect(await elvaria(io, 'seal', OTHER_QUEST_ID)).toBe(1);
    expect(await elvaria(io, 'return', OTHER_QUEST_ID, '--note', NOTE)).toBe(1);
    expect(io.printed.err).toEqual([
      `Quest ${OTHER_QUEST_ID} is «Open»: only work waiting for your seal can be sealed.`,
      `Quest ${OTHER_QUEST_ID} is «Open»: only work waiting for your seal can be returned.`,
    ]);
    expect(await inbox()).toEqual([]);
  });

  it('returns the work with a note and fail_kind, `other` by default', async () => {
    expect(await elvaria(testIo(), 'return', QUEST_ID, '--note', NOTE)).toBe(0);
    expect(await elvaria(testIo(), 'return', QUEST_ID, '--note', NOTE, '--fail-kind', 'wrong_facts')).toBe(0);
    expect((await inbox()).map(({ payload }) => payload)).toEqual([
      { quest: QUEST_ID, notes: NOTE, fail_kind: 'other' },
      { quest: QUEST_ID, notes: NOTE, fail_kind: 'wrong_facts' },
    ]);
  });

  it('returns the work for a new judgement with --rejudge, the assignee not charged (P1-40)', async () => {
    const io = testIo();
    expect(await elvaria(io, 'return', QUEST_ID, '--note', NOTE, '--rejudge')).toBe(0);
    expect(io.printed.out.join('\n')).toContain('for a new judgement');
    expect((await inbox()).map(({ payload }) => payload)).toEqual([
      { quest: QUEST_ID, notes: NOTE, fail_kind: 'other', rejudge: true },
    ]);
  });

  it('asks for a specific note of 20 characters and a known fail_kind before sending anything', async () => {
    const short = testIo();
    expect(await elvaria(short, 'return', QUEST_ID, '--note', 'Not good.')).toBe(2);
    expect(short.printed.err[0]).toContain('at least 20 characters');
    const kind = testIo();
    expect(await elvaria(kind, 'return', QUEST_ID, '--note', NOTE, '--fail-kind', 'ugly')).toBe(2);
    expect(kind.printed.err[0]).toContain('--fail-kind ugly is not a kind of failure');
    const none = testIo();
    expect(await elvaria(none, 'return', QUEST_ID)).toBe(2);
    expect(await inbox()).toEqual([]);
  });
});
