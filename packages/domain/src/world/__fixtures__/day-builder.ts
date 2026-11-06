// A scripted Steward for the world-state specs. It keeps the kingdom files as the truth, moves quests and
// characters only through transition() and transitionCharacter(), and writes the lines the real Steward will
// write (P1-03; the sandbox, P0-10): a quest event names its move with questLogTypeOf and carries the views
// after it. Replaying the lines from the morning's files must give the files after every line.
import { transitionCharacter } from '../../character/transition.ts';
import { formatUlid } from '../../core/id-source.ts';
import { currentRun } from '../../quest/attempt-log.ts';
import { transition } from '../../quest/transition.ts';
import { EventSchema } from '../../schema/event/event.ts';
import { characterViewOf } from '../character-view.ts';
import { questLogTypeOf } from '../quest-log-type.ts';
import { questViewOf } from '../quest-view.ts';
import { territoryViewOf } from '../territory-view.ts';
import type { CharacterEvent } from '../../character/transition.ts';
import type { Instant } from '../../core/clock.ts';
import type { CharacterId, QuestId, TribeId, VerdictId } from '../../core/ids.ts';
import type { QuestActor, QuestEvent } from '../../quest/events.ts';
import type { Character } from '../../schema/character/character.ts';
import type { Actor, Event } from '../../schema/event/event.ts';
import type { Quest } from '../../schema/quest/quest.ts';
import type { Territory } from '../../schema/territory.ts';
import type { ManaReadingView, PoolView } from '../mana-view.ts';
import type { WorldSource } from '../world-state.ts';

/** The files after `events` lines of the day. */
export interface Checkpoint {
  readonly events: number;
  readonly source: WorldSource;
}

export interface DayLog {
  readonly morning: WorldSource;
  readonly events: readonly Event[];
  readonly checkpoints: readonly Checkpoint[];
  readonly evening: WorldSource;
}

/** A change to a character file at the time of the line. */
export type Edit = (character: Character, at: string) => Character;

const must = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }, what: string): T => {
  if (!result.ok) throw new Error(`${what}: ${JSON.stringify(result.error)}`);
  return result.value;
};

/** The character after one event of its state machine (§2.6). */
export const step =
  (type: CharacterEvent['type'], quest?: QuestId): Edit =>
  (character, at) => {
    const event = (quest === undefined ? { type, at } : { type, at, quest }) as CharacterEvent;
    return must(transitionCharacter(character, event), `${character.id} ${type}`);
  };

/** A verdict on the character's work enters its reputation window (§3.13; the Steward does it in P1-03). */
export const judged =
  (verdict: string, result: 'pass' | 'fail', byHuman = false): Edit =>
  (character, at) => ({
    ...character,
    reputation: {
      window: [
        ...character.reputation.window,
        { verdict_id: verdict as VerdictId, result, by_human: byHuman, at },
      ],
    },
  });

export const both =
  (...edits: Edit[]): Edit =>
  (character, at) =>
    edits.reduce((current, edit) => edit(current, at), character);

/** Minute `m` after 09:00 of the fixture day, as kingdom files store time. */
export const at = (m: number): string =>
  `2026-11-06T${String(9 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00+07:00`;

const STEWARD: Actor = { kind: 'steward' };

function actorOf(actor: QuestActor, quest: Quest): Actor {
  if (actor === 'user') return { kind: 'user' };
  if (actor === 'runner') return { kind: 'character', id: quest.assignee! };
  if (actor === 'verifier') return { kind: 'character', id: quest.verifier! };
  return STEWARD;
}

const reasonOf = (event: QuestEvent): string =>
  event.type === 'breaker' ? `breaker:${event.trip}` : 'max_attempts';

const poolKey = (tribe: string, pool: string): string => `${tribe}/${pool}`;

// One function per kind of line, sharing the files it keeps; a fixture, so a closure is clearer than a module.
export function dayBuilder(morning: WorldSource) {
  const quests = new Map(morning.quests.map((quest) => [quest.id as string, quest]));
  const characters = new Map(morning.characters.map((character) => [character.id as string, character]));
  const territories = new Map(morning.territories.map((territory) => [territory.id as string, territory]));
  // Mana truth is kept by hand here, not with mana-view.ts, so the spec compares two implementations.
  const pools = new Map((morning.pools ?? []).map((pool) => [poolKey(pool.tribe, pool.pool), pool]));
  const events: Event[] = [];
  const checkpoints: Checkpoint[] = [];
  let minute = 0;

  const source = (): WorldSource => ({
    ...morning,
    quests: [...quests.values()],
    characters: [...characters.values()],
    territories: [...territories.values()],
    pools: [...pools.values()],
  });

  const tick = (): string => at((minute += 1));

  function append(type: string, actor: Actor, data: Record<string, unknown>, about?: Quest): void {
    const ts = at(minute);
    const run = about === undefined ? 0 : currentRun(about);
    const line = EventSchema.parse({
      v: 1,
      id: formatUlid(Date.parse(ts) as Instant, BigInt(events.length)),
      ts,
      type,
      actor,
      ...(about === undefined ? {} : { quest: about.id, territory: about.territory }),
      ...(run > 0 ? { attempt: run } : {}),
      data,
    });
    events.push(line);
    checkpoints.push({ events: events.length, source: source() });
  }

  function editAll(edits: Readonly<Record<string, Edit>>, ts: string): Character[] {
    return Object.entries(edits).map(([id, edit]) => {
      const next = edit(characters.get(id)!, ts);
      characters.set(id, next);
      return next;
    });
  }

  return {
    source,
    /** The Steward writes a new quest file: draft (quest.drafted) or open (quest.created). */
    create(quest: Quest): void {
      tick();
      quests.set(quest.id, quest);
      append(quest.status === 'draft' ? 'quest.drafted' : 'quest.created', STEWARD, {
        quest: questViewOf(quest),
      });
    },
    /** One move of the quest table (§2.5), with the characters the same step moves (§2.6). */
    move(
      id: QuestId,
      payload: { readonly type: QuestEvent['type'] } & Record<string, unknown>,
      actor: QuestActor,
      edits: Readonly<Record<string, Edit>> = {},
    ): void {
      const ts = tick();
      const before = quests.get(id)!;
      const event = { ...payload, at: ts } as QuestEvent;
      const after = must(transition(before, event, actor), `${id} ${before.status} ${event.type}`);
      quests.set(id, after);
      const moved = editAll(edits, ts);
      const type = questLogTypeOf(event.type, before.status, after.status);
      append(
        type,
        actorOf(actor, before),
        {
          ...(type === 'quest.infirmary' ? { reason: reasonOf(event) } : {}),
          quest: questViewOf(after),
          ...(moved.length > 0 ? { characters: moved.map(characterViewOf) } : {}),
        },
        after,
      );
    },
    /** A character changes with no quest move (sleep, wake, swamp, level): a character.* line. */
    character(id: CharacterId, type: `character.${string}`, edit: Edit): void {
      const [after] = editAll({ [id]: edit }, tick());
      append(type, STEWARD, { character: characterViewOf(after!) });
    },
    summon(character: Character): void {
      tick();
      characters.set(character.id, character);
      append('character.created', STEWARD, { character: characterViewOf(character) });
    },
    territory(territory: Territory, type: `territory.${string}`): void {
      tick();
      territories.set(territory.id, territory);
      append(type, STEWARD, { territory: territoryViewOf(territory) });
    },
    reading(tribe: TribeId, pool: string, reading: Omit<ManaReadingView, 'observed_at'>): void {
      const ts = tick();
      const key = poolKey(tribe, pool);
      const old: PoolView = pools.get(key) ?? { tribe, pool, asleep: false, readings: [] };
      const kept = old.readings.filter(({ window }) => window !== reading.window);
      const known = kept.length < old.readings.length;
      const fresh = { ...reading, observed_at: ts };
      const readings = known
        ? old.readings.map((r) => (r.window === reading.window ? fresh : r))
        : [...kept, fresh];
      pools.set(key, { ...old, readings });
      const { resets_at, ...rest } = reading;
      append('mana.level', STEWARD, { tribe, pool, ...rest, ...(resets_at === null ? {} : { resets_at }) });
    },
    sleep(tribe: TribeId, pool: string, asleep: boolean): void {
      tick();
      const key = poolKey(tribe, pool);
      pools.set(key, { ...(pools.get(key) ?? { tribe, pool, readings: [] }), asleep });
      append(asleep ? 'mana.exhausted' : 'mana.restored', STEWARD, { tribe, pool });
    },
    /** A line the world animates but does not keep (agent.*, verdict.*, command.*, a type it has never seen). */
    noise(type: string, actor: Actor, data: Record<string, unknown>, about?: QuestId): void {
      tick();
      append(type, actor, data, about === undefined ? undefined : quests.get(about));
    },
    log(): DayLog {
      return { morning, events, checkpoints, evening: source() };
    },
  };
}
