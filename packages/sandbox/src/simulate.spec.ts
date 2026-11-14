// The acceptance test of the sandbox (implementation-plan §7, P0-10): every fake day is valid against the event
// contract and the state machines, and its lines alone rebuild its evening, whatever the seed. That makes the
// sandbox an integration test of the domain too.
import { EventSchema, canTake, isEventOf, reduce, worldStateOf } from '@elvaria/domain';
import type { Event, QuestView } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { DATE, KINGDOM, REGISTRY, kingdomOf } from './__fixtures__/kingdom.ts';
import { DAYS } from './scenario.ts';
import { SCENARIOS } from './scenarios.ts';
import { simulateDay } from './simulate.ts';
import type { DayId } from './scenario.ts';
import type { DayInput, SandboxDay } from './simulate.ts';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 42];

function play(day: DayId, seed: number, more: Partial<DayInput> = {}): SandboxDay {
  const result = simulateDay({ day, seed, date: DATE, kingdom: KINGDOM, registry: REGISTRY, ...more });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const DAYS_PLAYED = DAYS.flatMap((day) => SEEDS.map((seed) => ({ day, seed, played: play(day, seed) })));
const questOf = (event: Event): QuestView | undefined => (event.data as { quest?: QuestView }).quest;
const typesOf = (day: DayId): Set<string> =>
  new Set(
    DAYS_PLAYED.filter((run) => run.day === day).flatMap(({ played }) =>
      played.events.map(({ type }) => type),
    ),
  );

describe('a fake day', () => {
  it('writes coded infirmary causes with the same parameters as the Steward', () => {
    const causes = DAYS_PLAYED.flatMap(({ played }) =>
      played.events
        .filter((event) => event.type === 'quest.infirmary')
        .map((event) => ({
          event,
          quest: played.evening.quests.find(({ id }) => id === event.quest),
        })),
    );
    expect(causes.length).toBeGreaterThan(0);
    for (const { event, quest } of causes) {
      if (!isEventOf(event, 'quest.infirmary')) continue;
      const { reason, trip } = event.data;
      expect(reason.code).not.toBe('legacy');
      if (trip === 'time')
        expect(reason).toEqual({
          code: 'breaker:time',
          params: { minutes: quest?.budget.max_minutes, limit: quest?.budget.max_minutes },
        });
      else if (trip === 'script_broken') expect(reason.code).toBe('script:broken');
      else expect(reason).toEqual({ code: 'quest:max_attempts', params: {} });
    }
  });

  it.each(DAYS_PLAYED)('$day, seed $seed: writes only lines the event contract accepts', ({ played }) => {
    for (const event of played.events) expect(EventSchema.parse(event)).toEqual(event);
  });

  it.each(DAYS_PLAYED)(
    '$day, seed $seed: rebuilds its evening files from the empty morning',
    ({ played }) => {
      expect(reduce(worldStateOf(played.morning), played.events)).toEqual(worldStateOf(played.evening));
    },
  );

  it('stays in one local day from 08:30, with ids that sort like the lines', () => {
    for (const { played } of DAYS_PLAYED) {
      expect(played.events[0]?.ts).toBe(`${DATE}T08:30:00+07:00`);
      expect(played.events.every(({ ts }) => ts.startsWith(DATE))).toBe(true);
      const ids = played.events.map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.toSorted()).toEqual(ids);
    }
  });

  it('starts from an empty world: the owner attaches the territories and summons the cast first', () => {
    const { morning, events } = play('busy', 42);
    expect([morning.territories, morning.characters, morning.quests]).toEqual([[], [], []]);
    const { territories, cast } = SCENARIOS.busy;
    const opening = events
      .slice(0, territories.length + cast.length)
      .map(({ type, actor }) => [type, actor.kind]);
    expect(opening).toEqual([
      ...territories.map(() => ['territory.attached', 'user']),
      ...cast.map(() => ['character.created', 'user']),
    ]);
  });

  it('gives the same lines for the same seed, and another day for another seed', () => {
    expect(play('busy', 42).events).toEqual(play('busy', 42).events);
    expect(play('busy', 43).events).not.toEqual(play('busy', 42).events);
  });
});

describe('the scenarios', () => {
  it('walk a busy day through the moves of the quest table', () => {
    const types = typesOf('busy');
    const moves = ['created', 'claimed', 'started', 'submitted', 'verdict', 'done', 'sealed', 'delivered'];
    const detours = ['returned', 'blocked', 'unblocked', 'infirmary', 'released'];
    for (const move of [...moves, ...detours]) expect(types).toContain(`quest.${move}`);
    for (const type of ['character.swamp', 'character.level_up', 'verdict.fail', 'agent.tool']) {
      expect(types).toContain(type);
    }
  });

  it('let the machine judge script-tier quests, with no character', () => {
    const scripts = DAYS_PLAYED.flatMap(({ played }) => played.events).filter(
      (event) => event.type === 'quest.done' && questOf(event)?.tier === 'script',
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const event of scripts) expect(questOf(event)).toMatchObject({ assignee: null, verifier: null });
  });

  it('keep a quiet day to its few quests', () => {
    for (const run of DAYS_PLAYED.filter(({ day }) => day === 'quiet')) {
      const created = run.played.events.filter(({ type }) => type === 'quest.created');
      expect(created).toHaveLength(SCENARIOS.quiet.quests);
    }
  });
});

describe('who works and who judges', () => {
  const lines = DAYS_PLAYED.flatMap(({ played }) => played.events);
  const characters = new Map(SCENARIOS.busy.cast.map((member) => [member.id, member]));

  it('claims through planTick: the class the quest requires, a level that may take its rank', () => {
    const claims = lines.filter(
      (event) => event.type === 'quest.claimed' && questOf(event)?.tier === 'session',
    );
    expect(claims.length).toBeGreaterThan(0);
    for (const event of claims) {
      const quest = questOf(event)!;
      // The level at the claim, from the line itself: characters level up during the day.
      const [taker] = (event.data as { characters: { id: string; class: string; level: number }[] })
        .characters;
      expect(taker).toMatchObject({ id: quest.assignee, class: quest.class_required });
      expect(canTake(taker!.level, quest.rank, true)).toBe(true);
    }
  });

  it('never lets the assignee judge its own work, and judges with another model (ADR 0008)', () => {
    const reviews = lines.filter(
      (event) => event.type === 'quest.started' && typeof questOf(event)?.verifier === 'string',
    );
    expect(reviews.length).toBeGreaterThan(0);
    for (const event of reviews) {
      const quest = questOf(event)!;
      expect(quest.verifier).not.toBe(quest.assignee);
      expect(characters.get(quest.verifier!)?.model).not.toBe(characters.get(quest.assignee!)?.model);
    }
  });
});

describe('the mana-out day', () => {
  const runs = DAYS_PLAYED.filter(({ day }) => day === 'mana-out').map(({ played }) => played.events);
  const claude = new Set(
    SCENARIOS['mana-out'].cast.filter(({ tribe }) => tribe === 'claude').map(({ id }) => id),
  );

  it('puts the Claude pool to sleep and wakes it, once', () => {
    for (const events of runs) {
      const sleeps = events.filter(({ type }) => type === 'mana.exhausted' || type === 'mana.restored');
      expect(sleeps.map(({ type, data }) => [type, data])).toEqual([
        ['mana.exhausted', { tribe: 'claude', pool: 'claude' }],
        ['mana.restored', { tribe: 'claude', pool: 'claude' }],
      ]);
    }
  });

  it('gives no quest to Claude characters while their pool sleeps', () => {
    for (const events of runs) {
      const from = events.findIndex(({ type }) => type === 'mana.exhausted');
      const to = events.findIndex(({ type }) => type === 'mana.restored');
      const asleep = events
        .slice(from, to)
        .filter(({ type }) => type === 'quest.claimed' || type === 'quest.started');
      for (const event of asleep) {
        const quest = questOf(event)!;
        // The character the line gives work to: a judge whose review starts, else the assignee. A judge of the
        // other tribe may still review a sleeping Claude character's submitted work.
        const taker = quest.status === 'review' ? quest.verifier : quest.assignee;
        expect(taker !== null && claude.has(taker) && quest.status !== 'paused_mana').toBe(false);
      }
    }
  });

  it('pauses running quests with their assignee and resumes them in the same attempt', () => {
    const paused = runs.flatMap((events) => events.filter(({ type }) => type === 'quest.paused'));
    expect(paused.length).toBeGreaterThan(0);
    for (const events of runs) {
      for (const pause of events.filter(({ type }) => type === 'quest.paused').map(questOf)) {
        const resume = events.find(
          (event) => event.type === 'quest.resumed' && questOf(event)?.id === pause!.id,
        );
        expect(questOf(resume!)).toMatchObject({ assignee: pause!.assignee, attempts: pause!.attempts });
      }
    }
  });
});

describe('the kingdom it plays in', () => {
  it('writes titles in the owner language', () => {
    const english = play('quiet', 42, {
      kingdom: kingdomOf({ owner: { profession: 'developer', locale: 'en' } }),
    });
    const titles = english.events
      .filter(({ type }) => type === 'quest.created')
      .map((event) => questOf(event)!.title);
    const known = new Set(
      SCENARIOS.quiet.templates.flatMap(({ titles: pairs }) => pairs.map(({ en }) => en)),
    );
    expect(titles.every((title) => known.has(title))).toBe(true);
  });

  it('leaves a disabled tribe without work', () => {
    const tribes = KINGDOM.tribes.map((tribe) =>
      tribe.id === 'gemini' ? { ...tribe, enabled: false } : tribe,
    );
    const { events } = play('busy', 42, { kingdom: kingdomOf({ tribes }) });
    const gemini = new Set(SCENARIOS.busy.cast.filter(({ tribe }) => tribe === 'gemini').map(({ id }) => id));
    const taken = events
      .filter(({ type }) => type === 'quest.claimed')
      .map((event) => questOf(event)!.assignee);
    expect(taken.some((id) => id !== null && gemini.has(id))).toBe(false);
  });

  it('refuses a kingdom without a tribe of the cast, and a date that does not exist', () => {
    const tribes = KINGDOM.tribes.filter(({ id }) => id !== 'gemini');
    const input = {
      day: 'busy',
      seed: 1,
      date: DATE,
      kingdom: kingdomOf({ tribes }),
      registry: REGISTRY,
    } as const;
    expect(simulateDay(input)).toEqual({ ok: false, error: [{ code: 'missing_tribe', id: 'gemini' }] });
    expect(simulateDay({ ...input, kingdom: KINGDOM, date: '2026-02-30' })).toEqual({
      ok: false,
      error: [{ code: 'invalid_date', date: '2026-02-30' }],
    });
  });
});
