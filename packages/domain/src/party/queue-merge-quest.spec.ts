// The merge queue's merge quest (PS-09b, K5): its payload from the quest whose delivery stopped, its place as a merge
// quest of that quest's party (or of the quest itself), the way of a party's merge quest it takes (plot, machine run,
// judges), the party readers that leave it out, and the quest it stands for archived with it.
import { describe, expect, it } from 'vitest';

import {
  KINGDOM,
  NOW,
  Q1,
  Q2,
  Q3,
  Q4,
  at,
  character,
  quest,
  snapshot,
} from '../dispatch/__fixtures__/snapshot.ts';
import { forgeArchives } from '../dispatch/in-base.ts';
import { questFromCommand } from '../dispatch/new-quest.ts';
import { planTick } from '../dispatch/plan-tick.ts';
import { partyIssues } from '../quest/party.ts';
import { partyOf, pastAssigneesOf } from '../verify/past-assignees-of.ts';
import { machineMergeDue } from './machine-merge.ts';
import { partyStatusOf } from './party-status.ts';
import { plotBaseOf } from './plot-base.ts';
import { isQueueMerge, queueMergeQuestOf } from './queue-merge-quest.ts';
import type { CampaignId, CharacterId, QuestId } from '../core/ids.ts';
import type { NewQuestContext } from '../dispatch/new-quest.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { QueueMergeInput } from './queue-merge-quest.ts';

const MERGE = 'q_20261106_m5n6p7' as QuestId;
const QUEUED = 'q_20261106_r8s9t1' as QuestId;
const SHA = 'abcdef1234567890abcdef1234567890abcdef12';

const KINDS = [
  {
    id: 'build',
    name_vi: 'Xây dựng',
    name_en: 'Build',
    classes_allowed: ['knight'],
    deliverable_type: 'branch',
    seal_default: false,
  },
] as unknown as QueueMergeInput['kinds'];

const onBranch = (base: Quest): Quest => ({
  ...base,
  plot: { type: 'worktree', path: `D:/dc1/.elvaria/worktrees/${base.id}`, branch: `quest/${base.id}` },
});

const done = (base: Quest): Quest => onBranch({ ...base, status: 'done' });

/** A quest outside a party, done, sealed, its delivery stopped at the queue's update. */
const rooms: Quest = done({
  ...quest(Q2, { scope: ['src/rooms/**'], tags: ['backend'] }),
  title: 'Rooms API',
  secrets_required: ['npm_token'],
  attempt_log: [
    {
      n: 1,
      character: 'thorn' as CharacterId,
      role: 'assignee',
      started_at: at(1),
      run_dir: `.runs/${Q2}-1`,
      outcome: 'submitted',
    },
  ],
});

const input = (
  origin: Quest,
  stop: QueueMergeInput['stop'],
  locale: 'vi' | 'en' = 'en',
): QueueMergeInput => ({
  origin,
  stop,
  base: { branch: 'main', commit: SHA },
  kinds: KINDS,
  locale,
});

const CONFLICT = { reason: 'conflict', paths: ['README.md', 'src/rooms/a.ts'] } as const;

const REGISTRY = {
  kinds: KINDS,
  tags: [{ id: 'backend' }, { id: 'infra' }],
  scripts: [],
} as unknown as NewQuestContext['registry'];

const CONTEXT: Omit<NewQuestContext, 'id'> = {
  at: at(30),
  breakers: KINGDOM.breakers,
  registry: REGISTRY,
  territories: [{ id: rooms.territory, secrets_allowed: ['npm_token'] }],
  quests: [Q1, Q2, Q3, Q4, MERGE],
};

/** The merge quest the Steward makes for `origin`, through questFromCommand as it does. */
function queued(origin: Quest, stop: QueueMergeInput['stop'] = CONFLICT): Quest {
  const { payload, party } = queueMergeQuestOf(input(origin, stop));
  const made = questFromCommand(payload, { ...CONTEXT, id: QUEUED, party });
  if (!made.ok) throw new Error(JSON.stringify(made.error));
  return made.value;
}

describe('queueMergeQuestOf', () => {
  it("opens a knight's sealed merge quest under the quest, on its scope and the conflicted files", () => {
    const made = queueMergeQuestOf(input(rooms, CONFLICT));
    expect(made.party).toEqual({ id: Q2, role: 'merge' });
    expect(made.payload).toEqual({
      draft: false,
      title: 'Build: Rooms API',
      description: expect.stringContaining(`The merge quest of quest ${Q2} («Rooms API»)`) as string,
      kind: 'build',
      rank: rooms.rank,
      territory: rooms.territory,
      tier: 'session',
      class_required: 'knight',
      tags: ['backend'],
      seal_required: true,
      secrets_required: ['npm_token'],
      scope_paths: ['src/rooms/**', 'README.md', 'src/rooms/a.ts'],
      depends_on: [Q2],
      parent_id: Q2,
      created_by: 'patrol',
    });
    const { description } = made.payload;
    expect(description).toContain(`quest/${Q2} up to main (abcdef1)`);
    expect(description).toContain('- README.md\n- src/rooms/a.ts');
    expect(description).toContain('Keep the changes of both sides');
  });

  it("names the red checks and their logs' ends, keeps a party's place and campaign, in the owner's language", () => {
    const merge: Quest = {
      ...done(quest(MERGE, { party: Q1, dependsOn: [Q4] })),
      party_role: 'merge',
      campaign_id: 'c_x' as CampaignId,
    };
    const checks = [{ name: 'unit', tail: 'FAIL a.spec.ts' }, { name: 'lint' }, { name: 'e2e', tail: '' }];
    const made = queueMergeQuestOf(input(merge, { reason: 'checks_red', checks }, 'vi'));
    expect(made.party).toEqual({ id: Q1, role: 'merge', contract: 'api/openapi.yaml' });
    expect(made.payload).toMatchObject({ title: `Xây dựng: ${merge.title}`, campaign_id: 'c_x' });
    expect(made.payload).not.toHaveProperty('scope_paths');
    expect(made.payload).not.toHaveProperty('secrets_required');
    expect(made.payload.description).toContain(
      'main merged cleanly, then these checks of the territory failed on the merged branch:\n- unit, the end of its log:\n```\nFAIL a.spec.ts\n```\n- lint\n- e2e',
    );
  });

  it('names the kind by its id when the registry has none, and keeps a quest without scope without one', () => {
    const made = queueMergeQuestOf({ ...input({ ...rooms, scope_paths: [] }, CONFLICT), kinds: [] });
    expect(made.payload.title).toBe('build: Rooms API');
    expect(made.payload).not.toHaveProperty('scope_paths');
    const red = queueMergeQuestOf(input(rooms, { reason: 'checks_red', checks: [{ name: 'unit' }] }));
    expect(red.payload.scope_paths).toEqual(['src/rooms/**']);
  });
});

describe("the merge queue's merge quest takes a party's merge quest's way", () => {
  it("starts on the quest's branch, the machine's first run merging the base branch, and never again after a retry", () => {
    const merge = queued(rooms);
    expect(isQueueMerge(merge)).toBe(true);
    expect(merge).toMatchObject({ party_id: Q2, party_role: 'merge', seal_required: true, status: 'open' });
    expect(merge).not.toHaveProperty('contract');
    const branch = `quest/${Q2}`;
    expect(plotBaseOf(merge, [rooms, merge])).toEqual({ from: [branch], merge: [branch], base: true });
    expect(machineMergeDue(merge)).toBe(true);
    expect(planTick(snapshot([rooms, merge], [character('kael')]), NOW)).toMatchObject({ merges: [QUEUED] });
    // The infirmary's retry puts attempts back to 0 and keeps the log: a knight takes it, not the machine (P1-55).
    const run = {
      n: 1,
      character: null,
      role: 'assignee',
      started_at: at(31),
      run_dir: 'r',
      outcome: 'cancelled',
    } as const;
    expect(machineMergeDue({ ...merge, attempt_log: [run] })).toBe(false);
  });

  it('is never judged by whoever worked the quest it stands for, outside a party or in one', () => {
    const merge = queued(rooms);
    expect(partyOf(merge, [rooms, merge, quest(Q3)])).toEqual([rooms]);
    expect(pastAssigneesOf(merge, partyOf(merge, [rooms, merge]))).toEqual(new Set(['thorn']));
  });

  it('forms no party of its own outside one, and is not the merge quest of the party it stands in', () => {
    const merge = queued(rooms);
    expect(partyStatusOf(Q2, [rooms, merge])).toBeUndefined();
    expect(partyIssues([rooms, merge])).toEqual([]);
    const contract = done(quest(Q1, { party: Q1, kind: 'plan', cls: 'mage' }));
    const part = done(quest(Q4, { party: Q1, dependsOn: [Q1] }));
    const own: Quest = { ...done(quest(MERGE, { party: Q1, dependsOn: [Q4] })), party_role: 'merge' };
    const again = queued(own, { reason: 'checks_red', checks: [{ name: 'unit' }] });
    expect(again).toMatchObject({ party_id: Q1, contract: 'api/openapi.yaml', depends_on: [MERGE] });
    const party = [contract, part, own, again];
    expect(partyIssues(party)).toEqual([]);
    expect(partyStatusOf(Q1, party)).toMatchObject({ merge: MERGE, stage: 'done' });
    expect(partyOf(again, party).map(({ id }) => id)).toEqual([Q1, Q4, MERGE]);
  });
});

describe('forgeArchives with the merge queue (PS-09b)', () => {
  it('archives the quest a merge quest of the queue stands for once that one is in the base branch', () => {
    const merge = done(queued(rooms));
    expect(forgeArchives({ in_base: [QUEUED], quests: [rooms, merge] }, [rooms, merge])).toEqual([
      Q2,
      QUEUED,
    ]);
    // A Steward stopped between the two archives finds the quest again from the merge's outcome.
    const archived = { ...merge, status: 'archived' } as const;
    expect(forgeArchives({ in_base: [QUEUED], quests: [rooms, archived] }, [rooms])).toEqual([Q2]);
    expect(forgeArchives({ in_base: [QUEUED] }, [rooms, merge])).toEqual([QUEUED]);
  });

  it('carries nothing for a merge quest not in base yet', () => {
    const merge = done(queued(rooms));
    expect(forgeArchives({ in_base: [], quests: [rooms, merge] }, [rooms, merge])).toEqual([]);
  });
});

describe('forgeArchives with a party (fix/merge-quest-followups (l))', () => {
  const contract = done(quest(Q1, { party: Q1, kind: 'plan', cls: 'mage' }));
  const part = done(quest(Q4, { party: Q1, dependsOn: [Q1] }));
  const tests: Quest = { ...done(quest(Q3, { party: Q1, dependsOn: [Q1] })), party_role: 'acceptance' };
  const own: Quest = {
    ...done(quest(MERGE, { party: Q1, dependsOn: [Q3, Q4] })),
    party_role: 'merge',
    parent_id: Q1,
  };
  const party = [contract, part, tests, own];

  it("takes the contract and every part with the party's merge quest: a squash leaves them no ancestry", () => {
    expect(forgeArchives({ in_base: [MERGE], quests: party }, party)).toEqual([Q1, Q4, Q3, MERGE]);
    // Only done ones, and none whose delivery still runs; a party not in base yet takes nothing.
    const working = { ...part, status: 'working' } as const;
    const running = { running: [Q3], checked: [] };
    const some = [contract, working, tests, own];
    const finished = [contract, tests, own];
    expect(forgeArchives({ in_base: [MERGE], quests: some, background: running }, finished)).toEqual([
      Q1,
      MERGE,
    ]);
    expect(forgeArchives({ in_base: [Q4], quests: party }, party)).toEqual([Q4]);
  });

  it("takes the whole party with the merge queue's merge quest of the party's merge quest", () => {
    const again = done(queued(own));
    expect(again.party_id).toBe(Q1);
    const all = [...party, again];
    expect(forgeArchives({ in_base: [QUEUED], quests: all }, all)).toEqual([Q1, Q4, Q3, MERGE, QUEUED]);
    // Another merge quest of the queue, not in base, stays: it is no part of the party's work.
    const other = { ...again, id: 'q_20261106_x2y3z4' as QuestId };
    const both = [...all, other];
    expect(forgeArchives({ in_base: [QUEUED], quests: both }, both)).not.toContain(other.id);
  });
});
