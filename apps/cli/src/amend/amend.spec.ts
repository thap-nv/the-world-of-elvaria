// The amendments' authors as `elvaria run`'s job on call (PS-22b, implementation-plan §3.16.2), with a scripted
// author (no mana): it waits for its tribe, asks the Chancellor or the mage of the plan in a session with no tool,
// and leaves one decide_amendment in the inbox; an acceptance beyond kingdom.delegation, a session that fails and an
// author nowhere to be found all hand the amendment to the owner; a decision in the inbox is never asked again.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { TribeIdSchema } from '@elvaria/domain';
import type { InboxCommand, Memo, Quest } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ACCEPT,
  ASKED,
  BODY,
  CHILD,
  CHILD_MEMO,
  CLAUDE,
  DRAFTED,
  DRAFTED_MEMO,
  PLAN,
  author,
  seedAmendments,
} from '../../test/amend.ts';
import { foundKingdom, tempDir, testIo } from '../../test/cli.ts';
import { REFUSAL, refusing } from '../../test/refusing.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { amendmentJob } from './job.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

describe("an amendment's author, on call (PS-22b)", () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await seedAmendments(dir.root, kingdom);
  });
  afterEach(() => dir.remove());

  const cli = (io: TestIo) => ({ io, locale: 'en' as const, localeFromFlag: true, t: translator('en') });
  const contextOf = async (io: TestIo) => {
    const ctx = await openKingdomContext({ values: { kingdom }, positionals: [] }, cli(io));
    if (ctx === undefined) throw new Error('kingdom');
    return ctx;
  };
  const inbox = async (): Promise<InboxCommand[]> =>
    (await openKingdom(kingdom).inbox.read()).flatMap(({ command }) => (command.ok ? [command.value] : []));
  const view = (amendments: readonly string[], busy: readonly string[] = []) => ({
    day: '2026-11-05',
    notices: {},
    amendments: amendments as Quest['id'][],
    busy: new Set(busy.map((tribe) => TribeIdSchema.parse(tribe))),
    signal: new AbortController().signal,
  });

  it('asks the Chancellor in a session with no tool, once, and waits for its tribe', async () => {
    const io = testIo();
    const runner = author(ACCEPT);
    const job = amendmentJob(await contextOf(io), { [CLAUDE]: runner });
    expect(await job.ready(view([]))).toBe(false);
    expect(await job.ready(view([DRAFTED.id], ['claude']))).toBe(false);
    expect(await job.ready(view([DRAFTED.id]))).toBe(true);
    await job.run(view([DRAFTED.id]));
    expect(runner.heard).toHaveLength(1);
    const [heard] = runner.heard;
    expect(heard?.character.id).toBe('aldric');
    expect(heard?.permissions.tools).toEqual([]);
    expect(heard?.prompt.system).toContain('You are the Chancellor of the kingdom of Elvaria');
    expect(heard?.prompt.user).toContain(BODY);
    expect(await inbox()).toEqual([
      expect.objectContaining({
        kind: 'decide_amendment',
        source: 'chancellor',
        payload: {
          memo: DRAFTED_MEMO.id,
          decision: 'accepted',
          note: 'Đúng: lint chặn.',
          description: '## Goal\n\nMới.',
          expected_updated_at: DRAFTED.updated_at,
        },
      }),
    ]);
    // Its decision waits in the inbox: no second session for it.
    expect(await job.ready(view([DRAFTED.id]))).toBe(false);
    await job.run(view([DRAFTED.id]));
    expect(runner.heard).toHaveLength(1);
  });

  it("asks the mage of the plan, reading the plan, in the Chancellor's office", async () => {
    // The plan was archived: its worktree is gone, its branch stays (§2.5 done.archive).
    const gone = path.join(dir.root, 'dc1-se-team', '.elvaria', 'worktrees', PLAN.id).replaceAll('\\', '/');
    await openKingdom(kingdom).quests.write({
      ...PLAN,
      plot: { type: 'worktree', path: gone, branch: `quest/${PLAN.id}` },
    });
    const io = testIo();
    const runner = author({ version: 1, decision: 'rejected', note: 'Kế hoạch đã chọn.', ask: [] });
    await amendmentJob(await contextOf(io), { [CLAUDE]: runner }).run(view([CHILD.id]));
    const [heard] = runner.heard;
    expect(heard?.character.id).toBe('merlin');
    expect(heard?.permissions.tools).toEqual([]);
    expect(heard?.prompt.system).toContain('You are a mage of the kingdom of Elvaria');
    expect(heard?.prompt.user).toContain('Gom mọi kiểm tra vào một lệnh.');
    // No plot left to read a plan file from: the prompt holds no summary block, and nothing fails.
    expect(heard?.prompt.user).not.toContain("# The plan's summary");
    expect(io.printed.err).toEqual([]);
    expect((await inbox())[0]?.payload).toEqual({
      memo: CHILD_MEMO.id,
      decision: 'rejected',
      note: 'Kế hoạch đã chọn.',
    });
  });

  // fix/mage-plan-file (PS-22b (C)): the mage reads the summary of the plan file its plan's plot still holds.
  it("gives the mage the summary of its plan's file, read from the plan's plot", async () => {
    const work = `quests/${PLAN.id}/work`;
    await openKingdom(kingdom).quests.write({ ...PLAN, plot: { type: 'folder', path: work } });
    const plans = path.join(kingdom, ...work.split('/'), 'plans');
    await mkdir(plans, { recursive: true });
    const summary = 'Hai phần: d1 thêm script check (hiệp sĩ, D), d2 cập nhật README.';
    await writeFile(path.join(plans, 'check.md'), `# Check\n\n## Summary\n\n${summary}\n\n## Survey\n\nx\n`);
    await writeFile(path.join(plans, 'old.md'), '# Old\n\n## Survey\n\nNo summary.\n');
    const runner = author({ version: 1, decision: 'rejected', note: 'Kế hoạch đã chọn.', ask: [] });
    await amendmentJob(await contextOf(testIo()), { [CLAUDE]: runner }).run(view([CHILD.id]));
    const user = runner.heard[0]?.prompt.user ?? '';
    expect(user).toContain(`# The plan's summary, in \`plans/check.md\`\n\n${summary}\n\n# The amendment`);
    expect(user).not.toContain('plans/old.md');
    expect(user).not.toContain('## Survey');
  });

  it('hands to the owner an acceptance beyond the delegation, a failed session, an author not here', async () => {
    const store = openKingdom(kingdom);
    await store.quests.write({ ...DRAFTED, rank: 'C' });
    const io = testIo();
    const ctx = await contextOf(io);
    await amendmentJob(ctx, { [CLAUDE]: author(ACCEPT) }).run(view([DRAFTED.id]));
    expect((await inbox())[0]?.payload).toEqual({
      memo: DRAFTED_MEMO.id,
      decision: 'owner',
      note: 'Đúng: lint chặn.',
      holds: ['above_rank'],
    });
    const failing = author({ version: 1 });
    await amendmentJob(ctx, { [CLAUDE]: failing }).run(view([CHILD.id]));
    expect((await inbox())[1]?.payload).toMatchObject({ decision: 'owner', holds: ['chancellor_asks'] });
    expect(io.printed.err).toContain(
      'The author of an amendment could not decide it (invalid_reply): it goes to you.',
    );
    await store.memos.write({
      ...CHILD_MEMO,
      id: 'm_20261105_cccccc' as Memo['id'],
      to: { route: 'author', author: 'ghost' as never },
    });
    await store.quests.write({
      ...CHILD,
      blocked: {
        question: BODY,
        asked_at: ASKED,
        amendment: { memo: 'm_20261105_cccccc' as Memo['id'], by: 'author' },
      },
    });
    const nobody = author(ACCEPT);
    const job = amendmentJob(ctx, { [CLAUDE]: nobody });
    // No author to wait for: ready whatever the tribes run.
    expect(await job.ready(view([CHILD.id], ['claude']))).toBe(true);
    await job.run(view([CHILD.id]));
    expect(nobody.heard).toEqual([]);
    expect((await inbox())[2]?.payload).toMatchObject({
      decision: 'owner',
      note: 'No author could read it (no Chancellor, or the mage of its plan is not here): you decide it.',
    });
  });

  // M2 of 2026-11-14: the owner's note said only `no_reply`, not what the CLI refused (fix/amendment-schema).
  it("hands to the owner an amendment whose author's CLI refused the session, with the CLI's line", async () => {
    const io = testIo();
    const refused = refusing();
    await amendmentJob(await contextOf(io), { [CLAUDE]: refused }).run(view([DRAFTED.id]));
    expect(refused.heard).toHaveLength(1);
    const why = `The author of an amendment could not decide it, its session ended in error: ${REFUSAL}. It goes to you.`;
    expect((await inbox())[0]?.payload).toMatchObject({
      memo: DRAFTED_MEMO.id,
      decision: 'owner',
      note: why,
    });
    expect(io.printed.err).toContain(why);
  });

  it('writes nothing when the Steward stops the session, and skips a quest that waits no more', async () => {
    const io = testIo();
    const ctx = await contextOf(io);
    const stopping = new AbortController();
    stopping.abort();
    await amendmentJob(ctx, { [CLAUDE]: author(ACCEPT) }).run({
      ...view([DRAFTED.id]),
      signal: stopping.signal,
    });
    expect(await inbox()).toEqual([]);
    await openKingdom(kingdom).quests.write({ ...DRAFTED, status: 'open', blocked: undefined });
    expect(
      await amendmentJob(ctx, { [CLAUDE]: author(ACCEPT) }).ready(view([DRAFTED.id, 'q_20261105_gone00'])),
    ).toBe(false);
  });
});
