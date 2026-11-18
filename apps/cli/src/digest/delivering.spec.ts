// `elvaria digest` and a done quest the Steward still delivers (fix/run-221-domain, ADR 0023): in the (221) run the
// digest told the owner to merge by hand and archive a quest whose merge quest was alive under `pr_merge`, as a must,
// for the quest that waited for its scope. While the merge quest lives, only the delivery's item names the quest.
import path from 'node:path';

import { EVENT_VERSION, EventSchema, TerritorySchema } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { GITHUB_REMOTE } from '../../test/credential.ts';
import { OTHER_QUEST_ID, QUEST_ID, UPDATED_AT, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir } from '../../test/cli.ts';

const MERGE_QUEST = 'q_20261106_9p5q4c';
const AT = '2026-11-06T08:10:00+07:00';

/** Worked by thorn, sealed, done and delivered on its worktree branch, its scope the scripts folder. */
const holder = questFixture('done', OTHER_QUEST_ID, {
  attempts: 1,
  attempt_log: [
    { n: 1, character: 'thorn', role: 'assignee', started_at: AT, run_dir: `.runs/${OTHER_QUEST_ID}-1` },
  ],
  scope_paths: ['scripts/**'],
  seal: { at: AT },
  deliverable: { type: 'branch', delivered_at: UPDATED_AT },
  plot: { type: 'worktree', path: 'C:/plots/q', branch: `quest/${OTHER_QUEST_ID}` },
});
const waiting = questFixture('open', QUEST_ID, { scope_paths: ['scripts/check.ts'] });
/** The merge quest the delivery's stop opened: the digest reads only whether it is archived. */
const mergeQuest = (status: 'open' | 'archived') =>
  questFixture(status, MERGE_QUEST, { parent_id: OTHER_QUEST_ID });

describe('elvaria digest: a done quest on its way to the base branch', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
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
        delivery: { mode: 'pr_merge' },
      }),
    );
    if (!written.ok) throw new Error(written.error.message);
    await openEventLog(kingdom).append([
      EventSchema.parse({
        v: EVENT_VERSION,
        id: '01JCF8X4Z6Q3W9N2M5R7T8V002',
        ts: '2026-11-06T08:40:00+07:00',
        type: 'delivery.failed',
        actor: { kind: 'steward' },
        data: {
          quest: OTHER_QUEST_ID,
          territory: 'do-an',
          stage: 'update',
          reason: 'conflict',
          paths: ['scripts/check.ts'],
          merge_quest: MERGE_QUEST,
        },
      }),
    ]);
  });
  afterEach(() => dir.remove());

  const digest = async () => {
    const io = testIo();
    expect(await run(io, 'digest', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    return io.printed.out.join('\n');
  };
  const held = `Quest ${OTHER_QUEST_ID} «Thêm script pnpm check» is done but still holds its scope`;

  it('names no scope held while its merge quest is alive, only the merge quest to follow', async () => {
    await plantQuests(kingdom, holder, waiting, mergeQuest('open'));
    const said = await digest();
    expect(said).not.toContain(held);
    expect(said).not.toContain(`elvaria quest archive ${OTHER_QUEST_ID}`);
    expect(said).toContain(`the merge quest ${MERGE_QUEST} resolves it.`);
    expect(said).toContain(`  \`elvaria quest show ${MERGE_QUEST}\``);
  });

  it('names the scope held again once the merge quest is archived: the owner acts', async () => {
    await plantQuests(kingdom, holder, waiting, mergeQuest('archived'));
    const said = await digest();
    expect(said).toContain(`${held}; ${QUEST_ID} wait for it.`);
    expect(said).toContain(`  \`elvaria quest deliver ${OTHER_QUEST_ID}\``);
  });
});
