// reduce(state, events): the world state after some events (implementation-plan §8 P0-09). The herald tails the
// log, reduces each new line into its state and sends the same lines to its clients, which reduce them with this
// same function: one reducer, so the phone and the desktop never disagree (§8, stage 2).
import { isTypedEvent } from '../schema/event/event.ts';
import { updatePool, withReading, withSleep } from './mana-view.ts';
import type { TypedEventType } from '../schema/event/event-data.ts';
import type { Event, EventOf } from '../schema/event/event.ts';
import type { CharacterView } from './character-view.ts';
import type { QuestLogType } from './quest-log-type.ts';
import type { WorldState } from './world-state.ts';

type Handler<T extends TypedEventType> = (state: WorldState, event: EventOf<T>) => WorldState;

const withCharacters = (state: WorldState, views: readonly CharacterView[]): WorldState['characters'] =>
  views.reduce((characters, view) => ({ ...characters, [view.id]: view }), state.characters);

/** The quest as the event states it; an archived quest leaves the world (worldStateOf drops it the same way). */
const onQuest: Handler<QuestLogType> = (state, { data }) => {
  const { quest, characters = [] } = data;
  const { [quest.id]: _left, ...others } = state.quests;
  const quests = quest.status === 'archived' ? others : { ...state.quests, [quest.id]: quest };
  return { ...state, quests, characters: withCharacters(state, characters) };
};

const onCharacter: Handler<`character.${string}` & TypedEventType> = (state, { data }) => ({
  ...state,
  characters: withCharacters(state, [data.character]),
});

const onTerritory: Handler<`territory.${string}` & TypedEventType> = (state, { data }) => ({
  ...state,
  territories: { ...state.territories, [data.territory.id]: data.territory },
});

/** A pool's reading moves its HUD band; the cap of one model (P1-32) does not, as for its sleep (onSleep). */
const onManaLevel: Handler<'mana.level'> = (state, { ts, data }) => {
  if (data.model !== undefined) return state;
  const { window, used_pct, resets_at, source } = data;
  const reading = { window, used_pct, resets_at: resets_at ?? null, source, observed_at: ts };
  return { ...state, pools: updatePool(state.pools, data, withReading(reading)) };
};

/**
 * A whole pool falls asleep or wakes (ADR 0009); its characters move through their own events. The cap of one model
 * (P1-22) leaves the pool's band as it is: the HUD has one band per pool, and the pool's other models still work.
 */
const onSleep =
  (asleep: boolean): Handler<'mana.exhausted' | 'mana.restored'> =>
  (state, { data }) => {
    if (data.model !== undefined) return state;
    const resets = 'resets_at' in data ? (data.resets_at ?? null) : null;
    return { ...state, pools: updatePool(state.pools, data, withSleep(asleep, resets)) };
  };

/** A memo filed opens in the world; it has no route until the Steward's next line routes it (PS-03). */
const onMemoFiled: Handler<'memo.filed'> = (state, { data, quest }) => ({
  ...state,
  memos: {
    ...state.memos,
    [data.memo]: { id: data.memo, kind: data.kind, from: data.from, quest: quest ?? null, route: null },
  },
});

const onMemoRouted: Handler<'memo.routed'> = (state, { data }) => {
  const memo = state.memos[data.memo];
  return memo === undefined
    ? state
    : { ...state, memos: { ...state.memos, [data.memo]: { ...memo, route: data.route } } };
};

/** A closed memo leaves the world, as an archived quest does (worldStateOf keeps open memos only). */
const onMemoClosed: Handler<'memo.closed'> = (state, { data }) => {
  const { [data.memo]: _closed, ...open } = state.memos;
  return { ...state, memos: open };
};

/**
 * Every type that changes what the world shows. Other types (agent.*, verdict.*, command.*, unknown ones)
 * leave the state as it is: the world animates them, it does not keep them.
 */
const HANDLERS: { readonly [T in TypedEventType]?: Handler<T> } = {
  'quest.drafted': onQuest,
  'quest.created': onQuest,
  'quest.claimed': onQuest,
  'quest.released': onQuest,
  'quest.started': onQuest,
  'quest.submitted': onQuest,
  'quest.returned': onQuest,
  'quest.verdict': onQuest,
  'quest.done': onQuest,
  'quest.sealed': onQuest,
  'quest.archived': onQuest,
  'quest.blocked': onQuest,
  'quest.unblocked': onQuest,
  'quest.paused': onQuest,
  'quest.resumed': onQuest,
  'quest.infirmary': onQuest,
  'quest.delivered': onQuest,
  'quest.edited': onQuest,
  'character.created': onCharacter,
  'character.sleep': onCharacter,
  'character.wake': onCharacter,
  'character.meditate': onCharacter,
  'character.suspend': onCharacter,
  'character.release': onCharacter,
  'character.swamp': onCharacter,
  'character.level_up': onCharacter,
  'character.level_down': onCharacter,
  'character.model_changed': onCharacter,
  'territory.attached': onTerritory,
  'territory.surveyed': onTerritory,
  'territory.health': onTerritory,
  'mana.level': onManaLevel,
  'mana.exhausted': onSleep(true),
  'mana.restored': onSleep(false),
  'memo.filed': onMemoFiled,
  'memo.routed': onMemoRouted,
  'memo.closed': onMemoClosed,
};

/** A replay of a sandbox day is bracketed by these two lines; their data is open. */
const SANDBOX_FLAG: Readonly<Partial<Record<string, boolean>>> = {
  'sandbox.replay.start': true,
  'sandbox.replay.end': false,
};

/** The state after one event; the same object when the event changes nothing the world keeps. */
export function applyEvent(state: WorldState, event: Event): WorldState {
  const sandbox = SANDBOX_FLAG[event.type];
  if (sandbox !== undefined) return sandbox === state.sandbox ? state : { ...state, sandbox };
  if (!isTypedEvent(event)) return state;
  // TypeScript cannot correlate HANDLERS[event.type] with the event's own type; the mapped type guarantees it.
  const handler = HANDLERS[event.type] as Handler<TypedEventType> | undefined;
  return handler === undefined ? state : handler(state, event);
}

/** The state after `events`, in log order. */
export const reduce = (state: WorldState, events: readonly Event[]): WorldState =>
  events.reduce(applyEvent, state);
