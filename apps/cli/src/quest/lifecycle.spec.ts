import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, UPDATED_AT, plantQuests, questFixture } from '../../test/quest.ts';
import { ownerMay } from './lifecycle.ts';
import type { TempDir } from '../../test/cli.ts';
import type { InboxCommand } from '@elvaria/domain';

describe('ownerMay', () => {
  it('follows the transition table: the owner confirms drafts and cancels unfinished quests (§2.5)', () => {
    expect(ownerMay(questFixture('draft'), 'confirm')).toBe(true);
    expect(ownerMay(questFixture('open'), 'confirm')).toBe(false);
    expect(ownerMay(questFixture('open'), 'cancel')).toBe(true);
    expect(ownerMay(questFixture('draft'), 'discard')).toBe(true);
    expect(ownerMay(questFixture('archived'), 'cancel')).toBe(false);
    // A row exists, but only the Steward claims.
    expect(ownerMay(questFixture('open'), 'claim')).toBe(false);
  });
});

describe('elvaria quest confirm, cancel, edit', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const quest = (io: ReturnType<typeof testIo>, ...args: string[]) =>
    run(io, 'quest', ...args, '--kingdom', kingdom, '--locale', 'en');
  const inbox = async (): Promise<InboxCommand[]> =>
    (await openKingdom(kingdom).inbox.read()).flatMap((item) =>
      item.command.ok ? [item.command.value] : [],
    );

  it('confirms a draft, and refuses an open quest', async () => {
    await plantQuests(kingdom, questFixture('draft'), questFixture('open', OTHER_QUEST_ID));
    const io = testIo();
    expect(await quest(io, 'confirm', QUEST_ID)).toBe(0);
    expect((await inbox()).map(({ kind, payload }) => ({ kind, payload }))).toEqual([
      { kind: 'confirm', payload: { quest: QUEST_ID } },
    ]);
    expect(io.printed.out[0]).toBe(`Sent the command to confirm quest ${QUEST_ID}.`);
    const refused = testIo();
    expect(await quest(refused, 'confirm', OTHER_QUEST_ID)).toBe(1);
    expect(refused.printed.err).toEqual([
      `Quest ${OTHER_QUEST_ID} is «Open»: only a draft needs confirming.`,
    ]);
  });

  it('cancels an unfinished quest with its reason, and discards a draft through archive', async () => {
    await plantQuests(kingdom, questFixture('open'), questFixture('draft', OTHER_QUEST_ID));
    expect(await quest(testIo(), 'cancel', QUEST_ID, '--reason', 'Không cần nữa')).toBe(0);
    expect(await quest(testIo(), 'cancel', OTHER_QUEST_ID)).toBe(0);
    expect((await inbox()).map(({ kind, payload }) => ({ kind, payload }))).toEqual([
      { kind: 'cancel', payload: { quest: QUEST_ID, reason: 'Không cần nữa' } },
      { kind: 'archive', payload: { quest: OTHER_QUEST_ID } },
    ]);
  });

  it('archives a done quest once delivered, and refuses one not delivered or not done (P1-11)', async () => {
    const delivered = { deliverable: { type: 'branch', delivered_at: UPDATED_AT } };
    await plantQuests(
      kingdom,
      questFixture('done', QUEST_ID, delivered),
      questFixture('done', OTHER_QUEST_ID),
    );
    const io = testIo();
    expect(await quest(io, 'archive', QUEST_ID)).toBe(0);
    expect(io.printed.out[0]).toBe(
      `Sent the command to archive quest ${QUEST_ID}: the Steward removes its worktree and keeps its branch.`,
    );
    expect((await inbox()).map(({ kind, payload }) => ({ kind, payload }))).toEqual([
      { kind: 'archive', payload: { quest: QUEST_ID } },
    ]);
    const undelivered = testIo();
    expect(await quest(undelivered, 'archive', OTHER_QUEST_ID)).toBe(1);
    expect(undelivered.printed.err[0]).toContain('is not delivered yet');
  });

  it('refuses to archive a quest that is not done: cancel is for unfinished ones', async () => {
    await plantQuests(kingdom, questFixture('open'));
    const io = testIo();
    expect(await quest(io, 'archive', QUEST_ID)).toBe(1);
    expect(io.printed.err).toEqual([
      `Quest ${QUEST_ID} is «Open»: only a done quest, or one in the infirmary, can be archived (use elvaria quest cancel for an unfinished one).`,
    ]);
    expect(await inbox()).toEqual([]);
  });

  // P1-56, (g) of the P1-50 report: Q10 stayed in the infirmary because both commands refused it (intervention 7).
  it('archives a quest in the infirmary, which has no delivery to wait for, with archive or cancel', async () => {
    await plantQuests(
      kingdom,
      questFixture('infirmary', QUEST_ID, { attempts: 3 }),
      questFixture('infirmary', OTHER_QUEST_ID, { attempts: 3 }),
    );
    const archived = testIo();
    expect(await quest(archived, 'archive', QUEST_ID)).toBe(0);
    expect(archived.printed.out[0]).toContain('to archive quest');
    const cancelled = testIo();
    expect(await quest(cancelled, 'cancel', OTHER_QUEST_ID, '--reason', 'Không làm nữa')).toBe(0);
    expect(cancelled.printed.out[0]).toBe(
      `Quest ${OTHER_QUEST_ID} is in the infirmary, where cancelling means archiving: sent the command to archive it; the Steward removes its worktree and keeps its branch with the work done.`,
    );
    // The Steward's `archive` is `infirmary.archive` for a quest in the infirmary (quest-commands.ts ARCHIVE_EVENT).
    expect((await inbox()).map(({ kind, payload }) => ({ kind, payload }))).toEqual([
      { kind: 'archive', payload: { quest: QUEST_ID } },
      { kind: 'archive', payload: { quest: OTHER_QUEST_ID, reason: 'Không làm nữa' } },
    ]);
  });

  it('refuses to cancel an archived quest, or one that is not there', async () => {
    await plantQuests(kingdom, questFixture('archived'));
    const io = testIo();
    expect(await quest(io, 'cancel', QUEST_ID)).toBe(1);
    expect(io.printed.err).toEqual([`Quest ${QUEST_ID} is «Archived»: it can no longer be cancelled.`]);
    const missing = testIo();
    expect(await quest(missing, 'confirm', OTHER_QUEST_ID)).toBe(1);
    expect(missing.printed.err).toEqual([`There is no quest ${OTHER_QUEST_ID}.`]);
  });

  it('prints why a quest file cannot be read', async () => {
    await mkdir(path.join(kingdom, 'quests'), { recursive: true });
    await writeFile(path.join(kingdom, 'quests', `${QUEST_ID}.json`), JSON.stringify({ version: 1 }));
    const io = testIo();
    expect(await quest(io, 'cancel', QUEST_ID)).toBe(1);
    expect(io.printed.err[0]).toBe(`quests/${QUEST_ID}.json does not match its schema:`);
  });

  it('edits through edit_quest, carrying the updated_at it read (§9.2)', async () => {
    await plantQuests(kingdom, questFixture('open'), questFixture('done', OTHER_QUEST_ID));
    const args = [
      '--title',
      'Mới',
      '--rank',
      'b',
      '--no-seal',
      '--depends-on',
      OTHER_QUEST_ID,
      '--max-minutes',
      '90',
      '--max-tokens',
      '0',
    ];
    expect(
      await quest(testIo(), 'edit', QUEST_ID, ...args, '--description', 'Mô tả mới', '--max-attempts', '2'),
    ).toBe(0);
    expect((await inbox())[0]).toMatchObject({
      kind: 'edit_quest',
      payload: {
        quest: QUEST_ID,
        expected_updated_at: UPDATED_AT,
        changes: {
          title: 'Mới',
          description: 'Mô tả mới',
          rank: 'B',
          seal_required: false,
          depends_on: [OTHER_QUEST_ID],
          budget: { max_minutes: 90, max_tokens: 0, max_attempts: 2 },
        },
      },
    });
  });

  // P1-56, (g) of the P1-50 report (intervention 16): `--max-minutes` changed the quest and nothing of the CLI that was
  // already running with the old `--print-timeout`; the owner waited for a clock that never moved.
  it('says a new minute ceiling reaches the next session only while a session may be running', async () => {
    const held = { assignee: 'wren', attempts: 1 };
    await plantQuests(
      kingdom,
      questFixture('working', QUEST_ID, held),
      questFixture('returned', OTHER_QUEST_ID, held),
    );
    const running = testIo();
    expect(await quest(running, 'edit', QUEST_ID, '--max-minutes', '103')).toBe(0);
    expect(running.printed.out.at(-1)).toBe(
      `Quest ${QUEST_ID} has a session running: the 103-minute ceiling applies to the next session only. The running session's CLI was given its clock when it opened (the old ceiling, 45 minutes) and is still cut by it; to give this session more time, stop it and open it again.`,
    );
    const between = testIo();
    expect(await quest(between, 'edit', OTHER_QUEST_ID, '--max-minutes', '103')).toBe(0);
    expect(between.printed.out.join('\n')).not.toContain('next session only');
    const tokens = testIo();
    expect(await quest(tokens, 'edit', QUEST_ID, '--max-tokens', '900000')).toBe(0);
    expect(tokens.printed.out.join('\n')).not.toContain('next session only');
  });

  it('refuses an edit that changes nothing, or changes it badly', async () => {
    await plantQuests(kingdom, questFixture('open'));
    const nothing = testIo();
    expect(await quest(nothing, 'edit', QUEST_ID)).toBe(2);
    expect(nothing.printed.err).toEqual([
      'Nothing to change: add at least one option (--title, --rank, --seal…).',
    ]);
    const bad = testIo();
    const args = [
      '--title',
      '',
      '--rank',
      'Z',
      '--max-minutes',
      '0',
      '--max-tokens',
      'many',
      '--depends-on',
      QUEST_ID,
    ];
    expect(await quest(bad, 'edit', QUEST_ID, ...args)).toBe(1);
    expect(bad.printed.err).toEqual([
      'A title has 1 to 120 characters.',
      '--rank takes one of: F, E, D, C, B, A, S.',
      '--max-minutes must be a whole number, not negative (minutes and attempts from 1).',
      '--max-tokens must be a whole number, not negative (minutes and attempts from 1).',
      'A quest cannot depend on itself.',
    ]);
    const missing = testIo();
    expect(await quest(missing, 'edit', OTHER_QUEST_ID, '--title', 'x')).toBe(1);
    expect(await inbox()).toEqual([]);
  });
});
