// planTick and the scope rules (implementation-plan §3.16.5, ADR 0028, PS-05): quests whose scopes are apart run at
// once on one code territory; a scope held keeps every quest whose scope meets it waiting until it is archived; a
// session-tier quest without a scope runs alone; shared paths are no overlap; a party's parts reach the merge quest.
import { describe, expect, it } from 'vitest';

import {
  NOW,
  Q1,
  Q2,
  Q3,
  Q4,
  KINGDOM,
  TERRITORY,
  character,
  moved,
  quest,
  returnedTo,
  snapshot,
  territory,
  workingBy,
} from './__fixtures__/snapshot.ts';
import { planTick } from './plan-tick.ts';
import type { QuestId, TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { KingdomSnapshot } from './plan-tick.ts';

/** A code territory that runs two quests at once, as one does once its quests declare scopes. */
const TWO = { territories: [territory(TERRITORY, 2)] };
const knights = (count = 2): Character[] =>
  ['thorn', 'kael', 'ella'].slice(0, count).map((id, index) => character(id, { since: index }));

const plan = (quests: readonly Quest[], characters = knights(), more: Partial<KingdomSnapshot> = TWO) =>
  planTick(snapshot(quests, characters, more), NOW);
const claimed = (quests: readonly Quest[], characters = knights(), more: Partial<KingdomSnapshot> = TWO) =>
  plan(quests, characters, more).claims.map(({ quest: id }) => id);

/** Worked by `who`, then in `status`. */
const ranThen = (base: Quest, status: Quest['status'], who = 'brann'): Quest => ({
  ...workingBy(base, who),
  status,
});
const onWorktree = (base: Quest): Quest => ({
  ...base,
  plot: { type: 'worktree', path: `D:/dc1/.elvaria/worktrees/${base.id}`, branch: `quest/${base.id}` },
});

describe('planTick: quests with scopes (PS-05)', () => {
  it('runs two quests whose scopes are apart at once on a code territory with max_concurrent 2', () => {
    const quests = [quest(Q1, { scope: ['apps/api/**'] }), quest(Q2, { scope: ['apps/web/**'] })];
    expect(claimed(quests)).toEqual([Q1, Q2]);
    // R1 as before: the third waits for a slot.
    expect(claimed([...quests, quest(Q3, { scope: ['docs/**'] })], knights(3))).toEqual([Q1, Q2]);
  });

  it('keeps a quest whose scope meets a held one waiting until that quest is archived', () => {
    const open = quest(Q2, { scope: ['apps/api/src/**'] });
    const holder = (status: Quest['status']) => ranThen(quest(Q1, { scope: ['apps/api/**'] }), status);
    for (const status of ['working', 'review', 'returned', 'done', 'infirmary'] as const)
      expect(claimed([holder(status), open])).toEqual([]);
    expect(claimed([holder('archived'), open])).toEqual([Q2]);
    const said = plan([holder('done'), open]);
    expect(said.unclaimable).toEqual([]);
  });

  it('never locks two open quests of one scope against each other: the first goes, the second waits', () => {
    const same = [quest(Q1, { scope: ['a/**'] }), quest(Q2, { scope: ['a/**'], created: 5 })];
    expect(claimed(same)).toEqual([Q1]);
  });

  it('lets files in shared_paths through: two quests apart that both edit a hot file run at once', () => {
    const index = 'packages/domain/src/index.ts';
    const quests = [quest(Q1, { scope: ['a/**', index] }), quest(Q2, { scope: ['b/**', index] })];
    expect(claimed(quests)).toEqual([Q1]);
    const shared = {
      territories: [{ ...territory(TERRITORY, 2), shared_paths: [{ glob: index, merge: 'union' as const }] }],
    };
    expect(claimed(quests, knights(), shared)).toEqual([Q1, Q2]);
  });

  it('starts a quest built on the branch of the quest that holds its scope', () => {
    const base = onWorktree(ranThen(quest(Q1, { scope: ['a/**'] }), 'done'));
    // Done and waiting for the owner's merge, it holds its scope against a quest beside it...
    expect(claimed([base, quest(Q2, { scope: ['a/**'] })])).toEqual([]);
    // ...not against one whose plot starts from its branch, which holds its work already.
    expect(claimed([base, quest(Q2, { scope: ['a/**'], dependsOn: [Q1] })])).toEqual([Q2]);
  });
});

describe('planTick: a session quest without a scope runs alone (PS-05)', () => {
  it('waits while any session quest works there, and keeps every quest off while it works', () => {
    const bare = quest(Q2);
    expect(claimed([workingBy(quest(Q1, { scope: ['a/**'] }), 'brann'), bare])).toEqual([]);
    expect(claimed([workingBy(quest(Q1), 'brann'), quest(Q2, { scope: ['b/**'] })])).toEqual([]);
    // It holds nothing once it stops working, and a scope held elsewhere is no reason for it to wait.
    expect(claimed([ranThen(quest(Q1), 'review'), quest(Q2, { scope: ['b/**'] })])).toEqual([Q2]);
    expect(claimed([ranThen(quest(Q1, { scope: ['a/**'] }), 'done'), bare])).toEqual([Q2]);
    // Two of them never start in one tick.
    expect(claimed([quest(Q1), bare])).toEqual([Q1]);
  });

  it('stands outside for script-tier quests, which neither wait nor keep anyone off', () => {
    const script = { ...quest(Q1, { script: true }), status: 'working' as const, attempts: 1 };
    expect(claimed([script, quest(Q2)])).toEqual([Q2]);
    expect(plan([workingBy(quest(Q1), 'brann'), quest(Q2, { script: true })]).scripts).toEqual([Q2]);
  });

  it('keeps quests with a scope that come after it off the territory while it waits there', () => {
    const working = workingBy(quest(Q1, { scope: ['a/**'] }), 'brann');
    const bare = quest(Q2, { rank: 'E', created: 1 });
    const later = quest(Q3, { scope: ['b/**'], rank: 'E', created: 2 });
    expect(claimed([working, bare, later])).toEqual([]);
    // Ahead of it in the queue (a higher rank), a quest with a scope still goes.
    const ahead = quest(Q4, { scope: ['c/**'], created: 3 });
    expect(claimed([working, bare, later, ahead])).toEqual([Q4]);
    // Nobody free to take it: it does not wait on the territory, so the others go.
    expect(claimed([working, quest(Q2, { cls: 'dwarf', rank: 'E', created: 1 }), later])).toEqual([Q3]);
  });
});

describe('planTick: starts, redispatches, wakes and reassigns keep the scope rules (PS-05)', () => {
  const holder = ranThen(quest(Q1, { scope: ['a/**'] }), 'done');

  it('starts a claimed quest and sends a returned one back only when no held scope meets theirs', () => {
    const claimedQuest = moved(quest(Q2, { scope: ['a/x.ts'] }), 10, [
      'claim',
      'steward',
      { assignee: 'thorn', level: 3 },
    ]);
    expect(plan([holder, claimedQuest]).starts).toEqual([]);
    expect(plan([{ ...holder, status: 'archived' }, claimedQuest]).starts).toEqual([Q2]);
    const back = returnedTo(quest(Q3, { scope: ['a/**'] }), 'kael');
    expect(plan([holder, back]).redispatches).toEqual([]);
    expect(plan([back]).redispatches).toEqual([Q3]);
  });

  it('wakes or hands over a paused quest only when no working quest without a scope keeps it off', () => {
    const paused = moved(workingBy(quest(Q2, { scope: ['b/**'] }), 'thorn', 10), 20, ['mana_out', 'mana']);
    const sleeper = {
      ...character('thorn', { status: 'sleeping_mana' }),
      status_before_sleep: 'working' as const,
      current: { quest: Q2, role: 'assignee' as const },
    };
    const alone = workingBy(quest(Q1), 'brann');
    expect(plan([alone, paused], [sleeper]).wakes).toEqual([]);
    expect(plan([paused], [sleeper]).wakes).toEqual([Q2]);
    const asleep: Partial<KingdomSnapshot> = {
      ...TWO,
      kingdom: { ...KINGDOM, mana: { ...KINGDOM.mana, reassign_after_hours: 0 } },
      asleep: [{ tribe: 'claude' as TribeId, pool: 'claude' }],
    };
    const taker = character('ash', { tribe: 'gemini' });
    expect(plan([alone, paused], [sleeper, taker], asleep).reassigns).toEqual([]);
    expect(plan([paused], [sleeper, taker], asleep).reassigns).toEqual([
      { quest: Q2, assignee: 'ash', level: 3 },
    ]);
  });
});

describe('planTick: a party whose parts are apart (PS-05)', () => {
  const contract = onWorktree(
    ranThen(quest(Q1, { party: Q1, kind: 'plan', cls: 'mage', scope: ['api/openapi.yaml'] }), 'done'),
  );
  const part = (id: QuestId, scope: string) => quest(id, { party: Q1, dependsOn: [Q1], scope: [scope] });

  it('runs the parts at once and reaches the merge quest, which their scopes never hold back', () => {
    expect(claimed([contract, part(Q2, 'api/src/**'), part(Q3, 'web/src/**')])).toEqual([Q2, Q3]);
    const done = [Q2, Q3].map((id, index) =>
      onWorktree(
        ranThen(part(id, index === 0 ? 'api/src/**' : 'web/src/**'), 'done', index === 0 ? 'brann' : 'ella'),
      ),
    );
    const merge: Quest = {
      ...quest(Q4, { party: Q1, dependsOn: [Q2, Q3], scope: ['api/src/**', 'web/src/**'] }),
      party_role: 'merge',
    };
    expect(plan([contract, ...done, merge]).merges).toEqual([Q4]);
    // The machine's merge stopped: a knight takes it on, beside the parts that hold its scope.
    const stopped = {
      ...merge,
      attempt_log: [
        {
          n: 1,
          character: null,
          role: 'assignee' as const,
          started_at: contract.updated_at,
          run_dir: `.runs/${Q4}-1`,
        },
      ],
    };
    expect(claimed([contract, ...done, stopped], [character('kael')])).toEqual([Q4]);
  });
});
