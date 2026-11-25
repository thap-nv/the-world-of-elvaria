// `elvaria digest` and a done quest the Steward still delivers (fix/run-221-domain, ADR 0023): in the (221) run the
// digest told the owner to merge by hand and archive a quest whose merge quest was alive under `pr_merge`, as a must,
// for the quest that waited for its scope. While the merge quest lives, only the delivery's item names the quest.
// (fix/run-221-followups) A pull request the delegation of the seal lets the Steward merge waits for nobody either,
// as in the Steward's own digest; once the breaker suspends the territory's delegation, the owner merges it.
import path from 'node:path';

import { EVENT_VERSION, EventSchema, SealDelegationSchema, TerritorySchema } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { GITHUB_REMOTE } from '../__fixtures__/credential.ts';
import { OTHER_QUEST_ID, QUEST_ID, UPDATED_AT, plantQuests, questFixture } from '../__fixtures__/quest.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

const MERGE_QUEST = 'q_20261106_9p5q4c';
const AT = '2026-11-06T08:10:00+07:00';

/** Worked by thorn, done and delivered on its worktree branch, its scope the scripts folder; sealed by default. */
const holderOf = (sealing: Record<string, unknown> = { seal: { at: AT } }) =>
  questFixture('done', OTHER_QUEST_ID, {
    attempts: 1,
    attempt_log: [
      { n: 1, character: 'thorn', role: 'assignee', started_at: AT, run_dir: `.runs/${OTHER_QUEST_ID}-1` },
    ],
    scope_paths: ['scripts/**'],
    deliverable: { type: 'branch', delivered_at: UPDATED_AT },
    plot: { type: 'worktree', path: 'C:/plots/q', branch: `quest/${OTHER_QUEST_ID}` },
    ...sealing,
  });
const holder = holderOf();
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
  });
  afterEach(() => dir.remove());

  const digest = async () => {
    const io = testIo();
    expect(await run(io, 'digest', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    return io.printed.out.join('\n');
  };
  const held = `Quest ${OTHER_QUEST_ID} «Thêm script pnpm check» is done but still holds its scope`;

  describe('stopped at an update, its merge quest open', () => {
    beforeEach(async () => {
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

  describe('its pull request open, the seal spared by the delegation', () => {
    const URL = 'https://github.com/elvaria-specs/kingdom-repo/pull/7';
    const spared = holderOf({ seal_delegated: true });
    let serial = 0;
    const line = (type: string, data: Record<string, unknown>) => {
      serial += 1;
      return EventSchema.parse({
        v: EVENT_VERSION,
        id: `01JCF8X4Z6Q3W9N2M5R7T8V${String(serial).padStart(3, '0')}`,
        ts: '2026-11-06T08:40:00+07:00',
        type,
        actor: { kind: 'steward' },
        data: { territory: 'do-an', ...data },
      });
    };
    beforeEach(async () => {
      const store = openKingdom(kingdom);
      const settings = await store.kingdom.read();
      if (!settings.ok) throw new Error(settings.error.message);
      const seal = SealDelegationSchema.parse({ max_rank: 'D', kinds: ['build'], max_diff_lines: 300 });
      await store.kingdom.write({ ...settings.value, delegation: { ...settings.value.delegation, seal } });
      await plantQuests(kingdom, spared, waiting);
      await openEventLog(kingdom).append([
        line('delivery.pushed', {
          quest: OTHER_QUEST_ID,
          branch: `quest/${OTHER_QUEST_ID}`,
          head: 'a'.repeat(40),
          forge: 'github',
          pr: { number: 7, url: URL },
        }),
      ]);
    });
    const opened = `The pull request of quest ${OTHER_QUEST_ID} «Thêm script pnpm check» is open for you (${URL})`;

    it('names neither its pull request nor the scope it holds: the Steward merges it', async () => {
      const said = await digest();
      expect(said).not.toContain(opened);
      expect(said).not.toContain(held);
    });

    it('names both once the breaker suspended the delegation on its territory: the owner merges it', async () => {
      await openEventLog(kingdom).append([
        line('delegation.suspended', { quest: OTHER_QUEST_ID, cause: 'base_red', check: 'unit' }),
      ]);
      const said = await digest();
      expect(said).toContain(opened);
      expect(said).toContain(`${held}; ${QUEST_ID} wait for it.`);
    });
  });
});
