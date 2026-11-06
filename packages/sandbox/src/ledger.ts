// The kingdom files of a fake day, held in memory, and the lines written about them: the same contract the
// Steward writes (implementation-plan §2.3, P0-09). Quests change only through transition() and characters only
// through transitionCharacter(); a quest line is named by questLogTypeOf and carries the views after the move.
// So a fake day is valid against the state machines by construction, and replaying its lines from the morning
// gives back its evening files (the spec checks it). A refused move is a bug in the sandbox: it throws.
import {
  EventSchema,
  characterViewOf,
  currentRun,
  questLogTypeOf,
  questViewOf,
  territoryViewOf,
  transition,
  transitionCharacter,
  updatePool,
  withReading,
  withSleep,
} from '@elvaria/domain';
import type {
  Actor,
  Character,
  CharacterEvent,
  CharacterId,
  Event,
  IdSource,
  PoolKey,
  PoolView,
  Quest,
  QuestActor,
  QuestEvent,
  QuestId,
  Result,
  Role,
  Territory,
  WorldSource,
} from '@elvaria/domain';

import type { DayClock } from './day-clock.ts';

/** A change to a character file, at the time of the line it belongs to. */
export type Edit = (character: Character, at: string) => Character;
export type Edits = Readonly<Record<string, Edit>>;
// Distributive over the union, so a payload is checked against the event of its own type.
type WithoutAt<T> = T extends unknown ? Omit<T, 'at'> : never;
/** A quest event without its time: the ledger gives it the time of its line. */
export type MovePayload = WithoutAt<QuestEvent>;

/** One `mana.level` reading (event-data.ts): a window of a pool, as the gauge read it. */
export interface ReadingData {
  readonly window: 'five_hour' | 'weekly';
  readonly used_pct: number;
  readonly resets_at?: string;
  readonly source: 'rate_limits' | 'estimate' | 'signal';
}

/** A line about something the files do not keep: agent.*, verdict.*, command.*, mana.signal, mana.probe. */
export interface Line {
  readonly type: string;
  readonly actor: Actor;
  readonly data: Readonly<Record<string, unknown>>;
  readonly quest?: Quest;
  /** The CLI session the line is about: every session of a fake day has an id. */
  readonly session?: string;
}

/** The value under `key`; the sandbox only asks for files it wrote, so a gap is a bug in it. */
export function found<T>(map: ReadonlyMap<string, T>, key: string): T {
  const value = map.get(key);
  if (value === undefined) throw new Error(`sandbox: no file ${key}`);
  return value;
}

/** The character holding the quest in `role`, where the state machine says one must (§2.5 invariants). */
export function holderOf(quest: Quest, role: Role): CharacterId {
  const id = role === 'assignee' ? quest.assignee : quest.verifier;
  if (typeof id !== 'string') throw new Error(`sandbox: ${quest.id} has no ${role}`);
  return id;
}

export function must<T>(result: Result<T, unknown>, what: string): T {
  if (!result.ok) throw new Error(`sandbox: ${what} refused: ${JSON.stringify(result.error)}`);
  return result.value;
}

/** The character after one event of its state machine (§2.6). */
export const step =
  (type: CharacterEvent['type'], quest?: QuestId): Edit =>
  (character, at) => {
    const event = (quest === undefined ? { type, at } : { type, at, quest }) as CharacterEvent;
    return must(transitionCharacter(character, event), `${character.id} ${type}`);
  };

const STEWARD: Actor = { kind: 'steward' };
const OWNER: Actor = { kind: 'user' };

function actorOf(actor: QuestActor, quest: Quest): Actor {
  if (actor === 'user') return OWNER;
  // transition() has accepted the move, so the runner held an assignee and the verifier was there.
  if (actor === 'runner') return { kind: 'character', id: holderOf(quest, 'assignee') };
  if (actor === 'verifier') return { kind: 'character', id: holderOf(quest, 'verifier') };
  return STEWARD;
}

/** Why a quest went to the infirmary, as the line says it (§3.4). */
function infirmaryReason(event: QuestEvent, quest: Quest): string {
  if (event.type === 'breaker') return `breaker:${event.trip}`;
  return quest.tier === 'script' ? 'script_error' : 'max_attempts';
}

interface Book {
  readonly quests: Map<string, Quest>;
  readonly characters: Map<string, Character>;
  readonly territories: Map<string, Territory>;
  pools: PoolView[];
  readonly events: Event[];
  readonly clock: DayClock;
  readonly ids: IdSource;
}

function write(book: Book, ts: string, line: Line): void {
  const run = line.quest === undefined ? 0 : currentRun(line.quest);
  const about = line.quest === undefined ? {} : { quest: line.quest.id, territory: line.quest.territory };
  const event = EventSchema.parse({
    v: 1,
    id: book.ids.ulid(),
    ts,
    type: line.type,
    actor: line.actor,
    ...about,
    ...(run > 0 ? { attempt: run } : {}),
    ...(line.session === undefined ? {} : { session: line.session }),
    data: line.data,
  });
  book.events.push(event);
}

function editAll(book: Book, edits: Edits, at: string): Character[] {
  return Object.entries(edits).map(([id, edit]) => {
    const next = edit(found(book.characters, id), at);
    book.characters.set(id, next);
    return next;
  });
}

function move(book: Book, id: QuestId, payload: MovePayload, actor: QuestActor, edits: Edits): Quest {
  const at = book.clock.stamp();
  const before = found(book.quests, id);
  const event: QuestEvent = { ...payload, at };
  const after = must(transition(before, event, actor), `${id} ${before.status} ${event.type}`);
  book.quests.set(id, after);
  const moved = editAll(book, edits, at);
  const type = questLogTypeOf(event.type, before.status, after.status);
  const data = {
    ...(type === 'quest.infirmary' ? { reason: infirmaryReason(event, after) } : {}),
    quest: questViewOf(after),
    ...(moved.length > 0 ? { characters: moved.map(characterViewOf) } : {}),
  };
  write(book, at, { type, actor: actorOf(actor, before), data, quest: after });
  return after;
}

function reading(book: Book, key: PoolKey, data: ReadingData): void {
  const ts = book.clock.stamp();
  const view = {
    window: data.window,
    used_pct: data.used_pct,
    resets_at: data.resets_at ?? null,
    source: data.source,
    observed_at: ts,
  };
  book.pools = updatePool(book.pools, key, withReading(view));
  write(book, ts, {
    type: 'mana.level',
    actor: STEWARD,
    data: { tribe: key.tribe, pool: key.pool, ...data },
  });
}

export interface Ledger {
  readonly quest: (id: QuestId) => Quest;
  readonly character: (id: CharacterId) => Character;
  readonly quests: () => Quest[];
  readonly characters: () => Character[];
  readonly pools: () => readonly PoolView[];
  /** The Steward writes a new open quest file (quest.created), made at the time of its line. */
  readonly create: (make: (at: string) => Quest) => Quest;
  /** One move of the quest table (§2.5) with the characters the same step moves (§2.6); the quest after it. */
  readonly move: (id: QuestId, payload: MovePayload, actor: QuestActor, edits?: Edits) => Quest;
  /** A character changes with no quest move (sleep, wake, swamp, level): a character.* line. */
  readonly change: (id: CharacterId, type: `character.${string}`, edit: Edit) => Character;
  /** The owner summons a character (character.created), made at the time of its line. */
  readonly summon: (make: (at: string) => Character) => void;
  readonly attach: (territory: Territory) => void;
  readonly reading: (key: PoolKey, data: ReadingData) => void;
  readonly sleep: (key: PoolKey, asleep: boolean) => void;
  readonly note: (line: Line) => void;
  readonly events: () => readonly Event[];
  /** The files as they stand now: the evening, once the day is over. */
  readonly source: () => WorldSource;
}

function created(book: Book, type: string, data: Line['data'], actor: Actor = STEWARD): void {
  write(book, book.clock.stamp(), { type, actor, data });
}

/** A new file in `map`, made at the time of its line, and the line that tells the world about it. */
function born<T extends { readonly id: string }>(
  book: Book,
  map: Map<string, T>,
  make: (at: string) => T,
  line: (made: T) => Omit<Line, 'quest' | 'session'>,
): T {
  const at = book.clock.stamp();
  const made = make(at);
  map.set(made.id, made);
  write(book, at, line(made));
  return made;
}

function change(book: Book, id: CharacterId, type: string, edit: Edit): Character {
  const at = book.clock.stamp();
  const after = edit(found(book.characters, id), at);
  book.characters.set(id, after);
  write(book, at, { type, actor: STEWARD, data: { character: characterViewOf(after) } });
  return after;
}

export function createLedger(morning: WorldSource, clock: DayClock, ids: IdSource): Ledger {
  const book: Book = {
    quests: new Map(morning.quests.map((quest) => [quest.id, quest])),
    characters: new Map(morning.characters.map((character) => [character.id, character])),
    territories: new Map(morning.territories.map((territory) => [territory.id, territory])),
    pools: [...(morning.pools ?? [])],
    events: [],
    clock,
    ids,
  };
  return {
    quest: (id) => found(book.quests, id),
    character: (id) => found(book.characters, id),
    quests: () => [...book.quests.values()],
    characters: () => [...book.characters.values()],
    pools: () => book.pools,
    create: (make) =>
      born(book, book.quests, make, (quest) => ({
        type: 'quest.created',
        actor: STEWARD,
        data: { quest: questViewOf(quest) },
      })),
    move: (id, payload, actor, edits = {}) => move(book, id, payload, actor, edits),
    change: (id, type, edit) => change(book, id, type, edit),
    summon: (make) => {
      born(book, book.characters, make, (character) => ({
        type: 'character.created',
        actor: OWNER,
        data: { character: characterViewOf(character) },
      }));
    },
    attach: (territory) => {
      book.territories.set(territory.id, territory);
      created(book, 'territory.attached', { territory: territoryViewOf(territory) }, OWNER);
    },
    reading: (key, data) => {
      reading(book, key, data);
    },
    sleep: (key, asleep) => {
      book.pools = updatePool(book.pools, key, withSleep(asleep));
      created(book, asleep ? 'mana.exhausted' : 'mana.restored', { tribe: key.tribe, pool: key.pool });
    },
    note: (line) => {
      write(book, clock.stamp(), line);
    },
    events: () => book.events,
    source: () => ({
      ...morning,
      quests: [...book.quests.values()],
      characters: [...book.characters.values()],
      territories: [...book.territories.values()],
      pools: book.pools,
    }),
  };
}
