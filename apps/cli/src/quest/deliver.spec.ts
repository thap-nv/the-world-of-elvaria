// `elvaria quest deliver <id>` (PS-08c, ADR 0023): the owner asks the Steward to deliver a done quest's branch to its
// forge again. The CLI writes the `deliver` command and refuses, as the Steward would, a quest that does not go to a
// forge.
import path from 'node:path';

import { TerritorySchema } from '@elvaria/domain';
import type { InboxCommand } from '@elvaria/domain';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { GITHUB_REMOTE } from '../__fixtures__/credential.ts';
import { OTHER_QUEST_ID, QUEST_ID, UPDATED_AT, plantQuests, questFixture } from '../__fixtures__/quest.ts';
import type { TempDir, TestIo } from '../__fixtures__/cli.ts';

/** A done quest the Steward delivered: its delivery note written, on its own worktree branch. */
const delivered = (id: string, extra: Record<string, unknown> = {}) =>
  questFixture('done', id, {
    deliverable: { type: 'branch', delivered_at: UPDATED_AT },
    plot: { type: 'worktree', path: 'C:/plots/q', branch: `quest/${id}` },
    ...extra,
  });

describe('elvaria quest deliver', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const deliver = (io: TestIo, id: string) =>
    run(io, 'quest', 'deliver', id, '--kingdom', kingdom, '--locale', 'en');
  const inbox = async (): Promise<InboxCommand[]> =>
    (await openKingdom(kingdom).inbox.read()).flatMap((item) =>
      item.command.ok ? [item.command.value] : [],
    );

  /** Territory do-an, a git repo on GitHub, delivering by `mode`. */
  async function territory(mode: 'manual' | 'pr'): Promise<void> {
    const written = await openKingdom(kingdom).territories.write(
      TerritorySchema.parse({
        version: 1,
        id: 'do-an',
        name: 'do-an',
        path: path.join(dir.root, 'do-an').replaceAll('\\', '/'),
        kind: 'code',
        vcs: { type: 'git', default_branch: 'main', remote: GITHUB_REMOTE },
        commands: {},
        checks: [],
        laws: { forbidden_paths: [], forbidden_commands: [] },
        secrets_allowed: [],
        delivery: { mode },
      }),
    );
    if (!written.ok) throw new Error(written.error.message);
  }

  it('sends the deliver command for a done quest of a territory that delivers to its forge', async () => {
    await territory('pr');
    await plantQuests(kingdom, delivered(QUEST_ID));
    const io = testIo();
    expect(await deliver(io, QUEST_ID)).toBe(0);
    expect(io.printed.out[0]).toBe(
      `Sent: the Steward delivers ${QUEST_ID} to the forge again at its next tick.`,
    );
    expect((await inbox()).map(({ kind, payload }) => ({ kind, payload }))).toEqual([
      { kind: 'deliver', payload: { quest: QUEST_ID } },
    ]);
  });

  it('refuses a quest that is not done', async () => {
    await territory('pr');
    await plantQuests(kingdom, questFixture('review', QUEST_ID, { assignee: 'thorn', attempts: 1 }));
    const io = testIo();
    expect(await deliver(io, QUEST_ID)).toBe(1);
    expect(io.printed.err).toEqual([`Quest ${QUEST_ID} is In review: only a done quest goes to the forge.`]);
    expect(await inbox()).toEqual([]);
  });

  it('refuses a done quest of a territory that delivers by hand', async () => {
    await territory('manual');
    await plantQuests(kingdom, delivered(QUEST_ID));
    const io = testIo();
    expect(await deliver(io, QUEST_ID)).toBe(1);
    expect(io.printed.err[0]).toContain(
      `Quest ${QUEST_ID} does not go to a forge: territory do-an delivers by hand`,
    );
    expect(await inbox()).toEqual([]);
  });

  it('refuses a done quest with no delivery note or no branch of its own, and a quest that is not there', async () => {
    await territory('pr');
    await plantQuests(
      kingdom,
      delivered(QUEST_ID, { deliverable: { type: 'branch' } }),
      delivered(OTHER_QUEST_ID, { plot: { type: 'none' } }),
    );
    for (const id of [QUEST_ID, OTHER_QUEST_ID]) {
      const io = testIo();
      expect(await deliver(io, id)).toBe(1);
      expect(io.printed.err[0]).toContain(`Quest ${id} does not go to a forge`);
    }
    const missing = testIo();
    expect(await deliver(missing, 'q_20261106_9z9z9z')).toBe(1);
    expect(missing.printed.err).toEqual(['There is no quest q_20261106_9z9z9z.']);
    expect(await inbox()).toEqual([]);
  });

  it('refuses a done quest whose territory is not there', async () => {
    await plantQuests(kingdom, delivered(QUEST_ID));
    const io = testIo();
    expect(await deliver(io, QUEST_ID)).toBe(1);
    expect(io.printed.err[0]).toContain(`Quest ${QUEST_ID} does not go to a forge`);
  });
});
