// The lines of the log a limited device receives (P2-01, W6, ADR 0037), so that reducing them into its scoped state
// gives what scopeState makes of the whole state after them. Lines go by an allow list, closed when unsure: a line of
// one of its territories or of their quests; a line of the whole kingdom (mana, characters, a sandbox day) that names
// neither; never a line of a type this build does not know. Kept lines clear a character's quest outside.
//
// Not every change reaches the device as a line. Most character moves ride on quest lines (`data.characters`): a
// character claiming a quest elsewhere turns busy on the device though the line is not sent. And a quest of its
// territories that enters or leaves the state changes how memos and characters pointing at it are seen. Then
// `resync` is set, and the Herald follows the lines with a fresh `scopeState` snapshot.
import { isKnownEventType } from '../schema/event/event-types.ts';
import { isTypedEvent } from '../schema/event/event.ts';
import { isQuestLogType } from '../world/quest-log-type.ts';
import { applyEvent } from '../world/reduce.ts';
import { maskedCharacter, questInside } from './scope-state.ts';
import type { QuestId } from '../core/ids.ts';
import type { Event, TypedEvent } from '../schema/event/event.ts';
import type { CharacterView } from '../world/character-view.ts';
import type { QuestLogType } from '../world/quest-log-type.ts';
import type { WorldState } from '../world/world-state.ts';
import type { Territories } from './scope-state.ts';

export interface ScopedEvents {
  /** The lines the device may receive, in order, characters' quests outside cleared. */
  readonly events: readonly Event[];
  /** A line it does not receive changed what it sees: send it `scopeState` of the state after the lines. */
  readonly resync: boolean;
}

type QuestLine = Extract<TypedEvent, { type: QuestLogType }>;
type CharacterLine = Extract<TypedEvent, { type: `character.${string}` }>;
type TerritoryLine = Extract<TypedEvent, { type: `territory.${string}` }>;
type MemoLine = Extract<TypedEvent, { type: `memo.${string}` }>;

const isQuestLine = (event: TypedEvent): event is QuestLine => isQuestLogType(event.type);
const isCharacterLine = (event: TypedEvent): event is CharacterLine => event.type.startsWith('character.');
const isTerritoryLine = (event: TypedEvent): event is TerritoryLine => event.type.startsWith('territory.');
const isMemoLine = (event: TypedEvent): event is MemoLine => event.type.startsWith('memo.');

/** Lines of the whole kingdom that name no territory and every device receives. */
const KINGDOM_WIDE = ['mana.', 'sandbox.replay.'] as const;

/** One line: the whole state before and after it, and the device's territories. */
interface Step {
  readonly before: WorldState;
  readonly after: WorldState;
  readonly territories: Territories;
}

interface Verdict {
  readonly line: Event | undefined;
  readonly resync: boolean;
}

const keep = (line: Event, resync = false): Verdict => ({ line, resync });
const drop = (resync: boolean): Verdict => ({ line: undefined, resync });

/** Where the envelope places a line: on a quest of the state and a territory, or nowhere. */
function envelopeInside(event: Event, { after, territories }: Step): boolean | 'kingdom' {
  if (event.quest === undefined && event.territory === undefined) return 'kingdom';
  if (event.quest !== undefined && !questInside(after, event.quest, territories)) return false;
  return event.territory === undefined || territories.includes(event.territory);
}

const masked = (step: Step, character: CharacterView): CharacterView =>
  maskedCharacter(step.after, character, step.territories);

/** True when the device sees `character` otherwise after the line than before it. */
function moved(step: Step, character: CharacterView): boolean {
  const seen = step.before.characters[character.id];
  if (seen === undefined) return true;
  const before = maskedCharacter(step.before, seen, step.territories);
  // Two views of one schema, written by characterViewOf in one key order: equal text is equal value.
  return JSON.stringify(before) !== JSON.stringify(masked(step, character));
}

/** A quest entered or left the state: what pointed at it, the line's own characters aside, is now seen otherwise. */
function placedAgain(step: Step, quest: QuestId, moving: readonly CharacterView[]): boolean {
  if ((step.before.quests[quest] === undefined) === (step.after.quests[quest] === undefined)) return false;
  const inLine = new Set(moving.map(({ id }) => id));
  const holders = Object.values(step.after.characters).filter(({ id }) => !inLine.has(id));
  return (
    holders.some(({ current }) => current?.quest === quest) ||
    Object.values(step.after.memos).some((memo) => memo.quest === quest)
  );
}

function questLine(event: QuestLine, step: Step): Verdict {
  const { quest, characters = [] } = event.data;
  if (!step.territories.includes(quest.territory))
    return drop(characters.some((character) => moved(step, character)));
  const seen = characters.map((character) => masked(step, character));
  const same = seen.every((character, at) => character === characters[at]);
  const line = same ? event : { ...event, data: { ...event.data, characters: seen } };
  return keep(line, placedAgain(step, quest.id, characters));
}

function characterLine(event: CharacterLine, step: Step): Verdict {
  if (envelopeInside(event, step) === false) return drop(moved(step, event.data.character));
  const character = masked(step, event.data.character);
  return keep(character === event.data.character ? event : { ...event, data: { ...event.data, character } });
}

/** A memo goes with its quest: memo.filed names it in the envelope, the later lines name the memo only. */
function memoLine(event: MemoLine, step: Step): Verdict {
  const quest =
    event.type === 'memo.filed' ? (event.quest ?? null) : (step.before.memos[event.data.memo]?.quest ?? null);
  return questInside(step.after, quest, step.territories) ? keep(event) : drop(false);
}

/** Any other line goes by its envelope; one that names nothing only when the whole kingdom's. */
function otherLine(event: Event, step: Step): Verdict {
  const inside = envelopeInside(event, step);
  if (inside === true || (inside === 'kingdom' && KINGDOM_WIDE.some((group) => event.type.startsWith(group))))
    return keep(event);
  // A dropped line that moved the state (mana of a quest outside, a type reduce learns later) resyncs.
  return drop(step.after !== step.before);
}

function scopeLine(event: Event, step: Step): Verdict {
  if (!isKnownEventType(event.type)) return drop(false);
  if (isTypedEvent(event)) {
    if (isQuestLine(event)) return questLine(event, step);
    if (isCharacterLine(event)) return characterLine(event, step);
    if (isTerritoryLine(event))
      return step.territories.includes(event.data.territory.id) ? keep(event) : drop(false);
    if (isMemoLine(event)) return memoLine(event, step);
  }
  return otherLine(event, step);
}

/** The lines of `events`, read after `state`, that a device limited to `territories` receives. */
export function scopeEvents(
  events: readonly Event[],
  state: WorldState,
  territories: Territories,
): ScopedEvents {
  const kept: Event[] = [];
  let resync = false;
  let before = state;
  for (const event of events) {
    const after = applyEvent(before, event);
    const verdict = scopeLine(event, { before, after, territories });
    if (verdict.line !== undefined) kept.push(verdict.line);
    resync ||= verdict.resync;
    before = after;
  }
  return { events: kept, resync };
}
