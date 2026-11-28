// "Cần ngài" from the files and the log (P2-04): the waits only the Steward's memory held before (a quest nobody can
// take, a quest waiting for a judge, a tribe held by its CLI) come from their lines as the files still allow them; the
// mana of the world state from the log's mana lines; the queue of the digest and the herald from both.
import { describe, expect, it } from 'vitest';

import { CLASSES, KINGDOM, Q1, Q2, Q3, Q4, inReview, quest } from '../dispatch/__fixtures__/snapshot.ts';
import { QUEST_CHANGE } from '../schema/event/__fixtures__/valid-data.ts';
import { EventSchema } from '../schema/event/event.ts';
import { CAMPAIGNS, TERRITORIES } from './__fixtures__/examples.ts';
import { attentionOf, judgingClassesOf, stewardNoticesOf, worldStateWithManaOf } from './steward-notices.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Registry } from '../schema/registry.ts';
import type { AttentionSource } from './steward-notices.ts';

const NOW = Date.parse('2026-11-27T22:30:00+07:00') as Instant;
const Q5 = 'q_20261106_p5q6r7' as QuestId;
const RESETS = '2026-11-27T23:00:00+07:00';

let serial = 0;
const line = (type: string, data: Record<string, unknown>, about?: QuestId): Event => {
  serial += 1;
  return EventSchema.parse({
    v: 2,
    id: `01JC${String(serial).padStart(22, '0')}`,
    ts: '2026-11-27T22:00:00+07:00',
    type,
    actor: { kind: 'steward' },
    ...(about === undefined ? {} : { quest: about }),
    data,
  });
};
const judgeWait = (about: QuestId, reason: string, gauges?: unknown[]) =>
  line('quest.judge_wait', { reason, ...(gauges === undefined ? {} : { gauges }) }, about);
const held = (tribe: string, version: string | null, checked: string) =>
  line('tribe.held', { tribe, hold: { path: `C:/${tribe}/cli.exe`, version, checked } });

/** The `build` kind's ritual asks for eyes; `research` has no kind in the registry, so no class judges it. */
const REGISTRY = {
  classes: CLASSES,
  kinds: [{ id: 'build', ritual: 'build_review' }],
  rituals: [{ id: 'build_review', vision: true }],
} as unknown as Pick<Registry, 'classes' | 'kinds' | 'rituals'>;

const QUESTS: Quest[] = [
  quest(Q1),
  inReview(quest(Q2), 'thorn'),
  inReview(quest(Q3), 'thorn'),
  quest(Q4),
  inReview(quest(Q5, { kind: 'research' }), 'thorn'),
];

const EVENTS: Event[] = [
  line('quest.unclaimable', { reason: 'no_class', rank: 'D', class: 'knight' }, Q1),
  line('quest.unclaimable', { reason: 'no_class', rank: 'D', class: 'knight' }, Q2),
  judgeWait(Q2, 'unjudgeable'),
  judgeWait(Q3, 'judge_mana', [
    { tribe: 'claude', pool: 'default', resets_at: RESETS },
    { tribe: 'gemini', pool: 'gemini_models' },
  ]),
  // An open quest does not wait for a judge, whatever an old line says.
  judgeWait(Q4, 'unjudgeable'),
  judgeWait(Q5, 'unjudgeable'),
  // gemini is held to the version it is checked on; claude's line names a check since passed; codex is disabled.
  held('gemini', null, '1.5.1'),
  held('claude', '2.1.320', '2.1.300'),
  held('codex', '0.9.0', '0.8.0'),
];

const SOURCE: AttentionSource = {
  kingdom: KINGDOM,
  territories: TERRITORIES,
  characters: [],
  quests: QUESTS,
  memos: [],
  verdicts: [],
  registry: REGISTRY,
  events: EVENTS,
};

describe('judgingClassesOf', () => {
  it('names the verifier classes of the kind', () => {
    expect(judgingClassesOf(REGISTRY.classes, quest(Q1).kind)).toEqual(['judge']);
    expect(judgingClassesOf(REGISTRY.classes, quest(Q5, { kind: 'research' }).kind)).toEqual([]);
  });
});

describe('stewardNoticesOf', () => {
  const notices = stewardNoticesOf(SOURCE);

  it('names an open quest unclaimable only while its file says it is open', () => {
    expect(notices.unclaimable).toEqual([Q1]);
  });

  it('names the quests in review that wait for a judge, with a class to summon and whether it needs eyes', () => {
    expect(notices.unjudgeable).toEqual([
      { quest: Q2, class: 'judge', vision: true },
      { quest: Q5, class: '<class>', vision: false },
    ]);
    expect(notices.judge_waits).toEqual([
      {
        quest: Q3,
        class: 'judge',
        gauges: [
          { tribe: 'claude', pool: 'default', resets_at: RESETS },
          { tribe: 'gemini', pool: 'gemini_models' },
        ],
      },
    ]);
  });

  it('names a held tribe that is enabled and still checked on the version it is held to', () => {
    expect(notices.tribes_held).toEqual([
      { tribe: 'gemini', path: 'C:/gemini/cli.exe', version: undefined, checked: '1.5.1' },
    ]);
  });

  it('carries what only the caller knows: an upgrade, none without one', () => {
    expect(notices.upgrade).toBeUndefined();
    const upgrade = { pinned: 'a'.repeat(40), latest: 'b'.repeat(40), commits: 3 };
    expect(stewardNoticesOf(SOURCE, { nothing: [Q1], upgrade }).upgrade).toEqual(upgrade);
  });
});

describe('worldStateWithManaOf', () => {
  it('reads the mana lines of the log into the files’ state, and no other line', () => {
    const state = worldStateWithManaOf(SOURCE, [
      line('mana.exhausted', { tribe: 'gemini', pool: 'gemini_models' }),
      line('quest.started', QUEST_CHANGE, QUEST_CHANGE.quest.id),
    ]);
    expect(state.pools.find(({ tribe }) => tribe === 'gemini')?.asleep).toBe(true);
    expect(state.pools.find(({ tribe }) => tribe === 'claude')?.asleep).toBe(false);
    expect(Object.keys(state.quests).toSorted()).toEqual([Q1, Q2, Q3, Q4, Q5].toSorted());
    expect(state.campaigns).toEqual([]);
  });

  it('keeps the campaigns it is given, for the Herald’s snapshot (P2-01c)', () => {
    const state = worldStateWithManaOf({ ...SOURCE, campaigns: CAMPAIGNS }, []);
    expect(state.campaigns.map(({ id }) => id)).toEqual(CAMPAIGNS.map(({ id }) => id));
    expect(state.campaigns.length).toBeGreaterThan(0);
  });
});

describe('attentionOf', () => {
  it('lists the waits of the log among the items of the files', () => {
    const items = attentionOf(SOURCE, NOW).map(({ kind, quest: id, tribe }) => [kind, id ?? tribe]);
    expect(items).toEqual(
      expect.arrayContaining([
        ['judge_mana', Q3],
        ['unjudgeable', Q5],
        ['unjudgeable_vision', Q2],
        ['unclaimable', Q1],
        ['tribe_gone', 'gemini'],
      ]),
    );
    expect(items.filter(([kind]) => kind === 'unclaimable')).toEqual([['unclaimable', Q1]]);
  });
});
