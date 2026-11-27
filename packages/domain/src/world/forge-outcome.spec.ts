// A done quest's delivery to its forge, read from the log (PS-08c): its latest outcome, forgotten by the owner's
// `deliver`; and the digest's two items, a delivery that stopped and a pull request that waits for the owner.
import { describe, expect, it } from 'vitest';

import { CAMPAIGNS, CHARACTERS, KINGDOM, TERRITORIES } from './__fixtures__/examples.ts';
import { ATTENTION_KINDS, ATTENTION_TABLE } from './attention-table.ts';
import { attentionQueue } from './attention.ts';
import { forgeOutcomesOf, forgeRoundsOf, trainOrdersOf, trainRidesOf } from './forge-outcome.ts';
import { worldStateOf } from './world-state.ts';
import { EventSchema } from '../schema/event/event.ts';
import { DeliverableSchema } from '../schema/quest/quest-parts.ts';
import { QuestSchema } from '../schema/quest/quest.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';
import type { Quest } from '../schema/quest/quest.ts';

const NOW = Date.parse('2026-11-16T08:00:00+07:00') as Instant;
const Q1 = 'q_20261116_aaaaa1' as QuestId;
const Q2 = 'q_20261116_aaaaa2' as QuestId;
const Q3 = 'q_20261116_aaaaa3' as QuestId;
const Q4 = 'q_20261116_aaaaa4' as QuestId;
const TERRITORY = TERRITORIES[0]?.id ?? '';
const HEAD = 'a'.repeat(40);
const PR = { number: 7, url: 'https://github.com/o/r/pull/7' };

let serial = 0;
const line = (type: string, data: Record<string, unknown>, quest?: QuestId): Event => {
  serial += 1;
  return EventSchema.parse({
    v: 2,
    id: `01JC${String(serial).padStart(22, '0')}`,
    ts: '2026-11-16T08:00:00+07:00',
    type,
    actor: { kind: quest === undefined ? 'steward' : 'user' },
    ...(quest === undefined ? {} : { quest }),
    data,
  });
};
const base = (quest: QuestId) => ({ quest, territory: TERRITORY, branch: `quest/${quest}` });
const pushed = (quest: QuestId) =>
  line('delivery.pushed', { ...base(quest), head: HEAD, forge: 'github', pr: PR });
const failed = (quest: QuestId, extra: Record<string, unknown> = {}) =>
  line('delivery.failed', { quest, territory: TERRITORY, stage: 'push', reason: 'push_refused', ...extra });
const merged = (quest: QuestId) =>
  line('delivery.merged', {
    ...base(quest),
    head: HEAD,
    pr: PR,
    merge_sha: 'b'.repeat(40),
    method: 'merge',
    sealed: true,
    branch_deleted: true,
  });
const deliverAgain = (quest?: QuestId, kind = 'deliver') =>
  line('command.applied', { command_id: '01JC0000000000000000000099', kind }, quest);

const TRAIN = '01KAZ5Q3J8M6R2T4V6X8Z0B2D4';
const onTerritory = (type: string, data: Record<string, unknown>, territory: string, ts?: string): Event =>
  EventSchema.parse({ ...line(type, data), territory, ...(ts === undefined ? {} : { ts }) });
const order = (territory: string, kind = 'deliver') =>
  onTerritory('command.applied', { command_id: '01JC0000000000000000000098', kind }, territory);
const ran = (territory: string, data: Record<string, unknown> = {}, ts?: string) =>
  onTerritory(
    'train.ran',
    { territory, train: TRAIN, departure: 'owner', steps: [], outcome: 'stopped', ...data },
    territory,
    ts,
  );
const onTrain = (quest: QuestId, extra: Record<string, unknown>) =>
  failed(quest, { stage: 'train', train: TRAIN, ...extra });

describe('forgeOutcomesOf', () => {
  it("keeps each quest's latest outcome", () => {
    const outcomes = forgeOutcomesOf([failed(Q1), pushed(Q1), pushed(Q2), merged(Q2)]);
    expect(outcomes.get(Q1)?.type).toBe('delivery.pushed');
    expect(outcomes.get(Q2)?.type).toBe('delivery.merged');
  });

  it("forgets it at the owner's deliver, which names the quest; other commands leave it", () => {
    const events = [failed(Q1), failed(Q2), deliverAgain(Q1), deliverAgain(Q2, 'retry'), deliverAgain()];
    const outcomes = forgeOutcomesOf(events);
    expect([...outcomes.keys()]).toEqual([Q2]);
    expect(forgeOutcomesOf([...events, failed(Q1)]).get(Q1)?.type).toBe('delivery.failed');
  });

  // (CM-08) A deliver naming a territory sends its train off; the order holds until a train of that territory ran.
  it("keeps the owner's train orders until the territory's next train.ran, and forgets no quest's outcome", () => {
    const events = [failed(Q1), order(TERRITORY), order('away'), order('patrolled', 'patrol'), ran('away')];
    expect(trainOrdersOf(events)).toEqual([TERRITORY]);
    expect(forgeOutcomesOf(events).get(Q1)?.type).toBe('delivery.failed');
    expect(trainOrdersOf([...events, ran(TERRITORY), deliverAgain(Q1)])).toEqual([]);
    expect(trainOrdersOf([order('b-side'), order('a-side')])).toEqual(['a-side', 'b-side']);
  });

  // (623) The order of a territory's train forgets the failures on its trains, but those a merge quest resolves.
  it("forgets the failures on the territory's trains at the owner's order, but a merge quest's (623)", () => {
    const away = 'q_20261116_aaaaa5' as QuestId;
    const pushStage = 'q_20261116_aaaaa6' as QuestId;
    const events = [
      onTrain(Q1, { reason: 'checks_red' }),
      onTrain(Q2, { reason: 'update_failed' }),
      onTrain(Q3, { reason: 'conflict' }),
      onTrain(Q4, { reason: 'checks_red', merge_quest: Q1 }),
      onTrain(away, { reason: 'checks_red', territory: 'away' }),
      failed(pushStage),
    ];
    const kept = (log: readonly Event[]) => [...forgeOutcomesOf(log).keys()];
    expect(kept(events)).toHaveLength(6);
    expect(kept([...events, order(TERRITORY, 'patrol'), order(TERRITORY)])).toEqual([
      Q3,
      Q4,
      away,
      pushStage,
    ]);
  });

  it('counts the red trains each delivered quest rode since its delivery and the last deliver (CM-08b)', () => {
    const at = (minute: number) => `2026-11-16T08:${String(minute).padStart(2, '0')}:00+07:00`;
    const riding = (steps: readonly QuestId[], minute: number, outcome = 'red') =>
      ran(
        TERRITORY,
        { steps: steps.map((quest) => ({ quest, commit: HEAD })), outcome, head: HEAD },
        at(minute),
      );
    const quest = (id: QuestId, delivered?: number) => ({
      id,
      territory: TERRITORY as TerritoryId,
      deliverable: DeliverableSchema.parse({
        type: 'branch',
        ...(delivered === undefined ? {} : { delivered_at: at(delivered) }),
      }),
    });
    const quests = [quest(Q1, 10), quest(Q2, 10), quest(Q3, 30), quest(Q4)];
    const rides = (log: readonly Event[]) => Object.fromEntries(trainRidesOf(log, quests));
    const four = [Q1, Q2, Q3, Q4];
    expect(rides([riding(four, 20), riding(four, 40), riding([Q1], 50, 'green')])).toEqual({
      [Q1]: 2,
      [Q2]: 2,
      [Q3]: 1,
    });
    expect(rides([riding([Q1, Q2], 20), deliverAgain(Q1), riding([Q2], 40)])).toEqual({ [Q2]: 2 });
    expect(rides([riding([Q1, Q2], 20), order('away'), order(TERRITORY), riding([Q2], 40)])).toEqual({
      [Q2]: 1,
    });
  });

  it('counts the updates of each delivery: its pushes after the first, since the last deliver (PS-09)', () => {
    const rounds = forgeRoundsOf([pushed(Q1), pushed(Q1), pushed(Q2), failed(Q1), pushed(Q1)]);
    expect(Object.fromEntries(rounds)).toEqual({ [Q1]: 2, [Q2]: 0 });
    expect(forgeRoundsOf([pushed(Q1), pushed(Q1), deliverAgain(Q1), pushed(Q1)]).get(Q1)).toBe(0);
    expect(forgeRoundsOf([failed(Q1)]).size).toBe(0);
  });

  it('ignores every other line', () => {
    expect(
      forgeOutcomesOf([
        line('digest.written', { day: '2026-11-16', file: 'digest/2026-11-16.md', must: 0, can_wait: 0 }),
      ]).size,
    ).toBe(0);
  });
});

const doneQuest = (id: QuestId, status: Quest['status'] = 'done'): Quest =>
  QuestSchema.parse({
    version: 1,
    id,
    title: `Quest ${id.slice(-1)}`,
    description: 'A delivered quest.',
    kind: 'document',
    rank: 'D',
    territory: TERRITORY,
    class_required: 'scribe',
    tags: ['docs'],
    status,
    tier: 'session',
    assignee: null,
    verifier: null,
    depends_on: [],
    budget: { max_minutes: 45, max_tokens: 400000, max_attempts: 3 },
    estimate: { tokens: 200000, minutes: 30 },
    attempts: 1,
    attempt_log: [],
    plot: { type: 'worktree', path: 'C:/repo/w', branch: `quest/${id}` },
    deliverable: { type: 'branch' },
    seal_required: false,
    created_by: 'user',
    created_at: '2026-11-16T07:00:00+07:00',
    updated_at: '2026-11-16T07:30:00+07:00',
  });

const stateOf = (quests: readonly Quest[]) =>
  worldStateOf({
    kingdom: KINGDOM,
    territories: TERRITORIES,
    characters: CHARACTERS,
    quests,
    campaigns: CAMPAIGNS,
  });

describe('attentionQueue for deliveries to the forge', () => {
  it('asks for the delivery again when it stopped, and waits on the owner to merge an open pull request', () => {
    const outcomes = forgeOutcomesOf([failed(Q1, { pr: PR }), pushed(Q2)]);
    const items = attentionQueue(stateOf([doneQuest(Q1), doneQuest(Q2)]), NOW, {
      deliveries: [...outcomes.values()],
    });
    expect(items.map(({ kind, group, quest, command }) => [kind, group, quest, command.join(' ')])).toEqual([
      ['delivery_failed', 'must', Q1, `quest deliver ${Q1}`],
      ['delivery_waits', 'can_wait', Q2, `quest archive ${Q2}`],
    ]);
    expect(items[0]).toMatchObject({ stage: 'push', reason: 'push_refused', url: PR.url, title: 'Quest 1' });
    expect(items[1]).toMatchObject({ url: PR.url, advice: 'merge_pr_and_archive' });
  });

  it('says nothing of a failure without a pull request beyond where it stopped', () => {
    const outcomes = forgeOutcomesOf([failed(Q1, { stage: 'scan', reason: 'secret', paths: ['a.ts'] })]);
    const [item] = attentionQueue(stateOf([doneQuest(Q1)]), NOW, { deliveries: [...outcomes.values()] });
    expect(item).toMatchObject({ kind: 'delivery_failed', stage: 'scan', reason: 'secret' });
    expect(item?.url).toBeUndefined();
  });

  it('says nothing of a merged delivery, nor of a quest archived or no longer known', () => {
    const outcomes = forgeOutcomesOf([merged(Q1), pushed(Q2), failed('q_20261116_zzzzz9' as QuestId)]);
    const state = stateOf([doneQuest(Q1), doneQuest(Q2, 'archived')]);
    expect(attentionQueue(state, NOW, { deliveries: [...outcomes.values()] })).toEqual([]);
  });

  it('waits on a merge quest of the queue on its way, and asks the owner again once it is dropped (PS-09b)', () => {
    const conflict = { stage: 'update', reason: 'conflict', paths: ['a.ts'], merge_quest: Q2 };
    const deliveries = [...forgeOutcomesOf([failed(Q1, conflict)]).values()];
    const merge = (status: Quest['status']): Quest => doneQuest(Q2, status);
    const items = (quests: readonly Quest[], outcomes = deliveries) =>
      attentionQueue(stateOf([doneQuest(Q1), ...quests]), NOW, { deliveries: outcomes }).map(
        ({ kind, group, command }) => [kind, group, command.join(' ')],
      );
    const waiting = [['delivery_merging', 'can_wait', `quest show ${Q2}`]];
    expect(items([merge('done')])).toEqual(waiting);
    // Archived once the Steward merged it: it took the quest with it, archived at the same tick.
    const both = [...forgeOutcomesOf([failed(Q1, conflict), merged(Q2)]).values()];
    expect(items([merge('archived')], both)).toEqual(waiting);
    expect(items([merge('archived')])).toEqual([['delivery_failed', 'must', `quest deliver ${Q1}`]]);
    expect(items([])).toEqual([['delivery_failed', 'must', `quest deliver ${Q1}`]]);
    const [item] = attentionQueue(stateOf([doneQuest(Q1), merge('open')]), NOW, { deliveries });
    expect(item).toMatchObject({
      stage: 'update',
      reason: 'conflict',
      merge_quest: Q2,
      advice: 'follow_merge_quest',
    });
  });

  it('lists a stopped delivery among the items the work waits on, a waiting pull request among the others', () => {
    expect(ATTENTION_TABLE.delivery_failed.group).toBe('must');
    expect(ATTENTION_TABLE.delivery_waits.group).toBe('can_wait');
    expect(ATTENTION_KINDS.indexOf('delivery_failed')).toBe(ATTENTION_KINDS.indexOf('infirmary') + 1);
  });
});
