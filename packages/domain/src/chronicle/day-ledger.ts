// The day's ledger (P2-06): what happened on one local day of the kingdom, read from the event log and nothing else
// (ADR 0017: the machine builds the facts; the chronicle only words them). A line falls on the day its instant has in
// kingdom.tz, whatever offset it was written with. Each entry names its quest, its territory and the characters by
// name, as the log last showed them up to that line, or as the files show them now.
import { err, ok } from '../core/result.ts';
import { parseInstant, zonedTime } from '../core/clock.ts';
import { LOCAL_DAY_PATTERN } from '../schedule/constants.ts';
import { LEDGER_KINDS } from '../schema/chronicle/ledger.ts';
import { LEDGER_TABLE, LOCAL_DAY_LENGTH } from './constants.ts';
import type { CharacterId, QuestId, TerritoryId, TribeId } from '../core/ids.ts';
import type { ZonedTime } from '../core/clock.ts';
import type { Result } from '../core/result.ts';
import type { Event } from '../schema/event/event.ts';
import type { CharacterRef, ChronicleLedger, LedgerEntry, LedgerKind } from '../schema/chronicle/ledger.ts';
import type { CharacterView } from '../world/character-view.ts';
import type { QuestView } from '../world/quest-view.ts';

/** What a quest's entries say of it beside its id. */
interface QuestFacts {
  readonly title: string;
  readonly territory: TerritoryId;
  readonly assignee?: CharacterId | null | undefined;
}

/** The kingdom as its files show it now: its zone, and the names of what the log may name by id alone. */
export interface LedgerWorld {
  readonly tz: string;
  readonly characters: readonly CharacterRef[];
  readonly quests: readonly ({ readonly id: QuestId } & QuestFacts)[];
}

export type LedgerError = 'invalid_day' | 'invalid_time_zone';

interface Known {
  readonly quests: Map<QuestId, QuestFacts>;
  readonly names: Map<CharacterId, string>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * The views a line carries (P0-09): EventSchema checked `data` of every typed line, and a `quest` or `character` object
 * there is always the view after it.
 */
const questViewIn = (event: Event): QuestView | undefined =>
  isObject(event.data.quest) ? (event.data.quest as QuestView) : undefined;

/** A character.* line's own character (`character`); a quest line's moved ones (`characters`) are only learnt. */
const movedIn = (event: Event): CharacterView | undefined =>
  isObject(event.data.character) ? (event.data.character as CharacterView) : undefined;

const characterViewsIn = (event: Event): readonly CharacterView[] => {
  const moved = movedIn(event);
  const { characters } = event.data;
  const many = Array.isArray(characters) ? (characters as CharacterView[]) : [];
  return moved === undefined ? many : [moved, ...many];
};

/** What the line teaches of names and quests, before its own entry is read. */
function learn(known: Known, event: Event): void {
  const quest = questViewIn(event);
  if (quest !== undefined) known.quests.set(quest.id, quest);
  for (const { id, name } of characterViewsIn(event)) known.names.set(id, name);
}

const refOf = (known: Known, id: CharacterId | null | undefined): CharacterRef | undefined => {
  if (id === null || id === undefined) return undefined;
  const name = known.names.get(id);
  return name === undefined ? undefined : { id, name };
};

const textIn = (event: Event, key: string): string | undefined => {
  const value = event.data[key];
  return typeof value === 'string' ? value : undefined;
};

/** The pool fields of a mana line (ManaPoolDataSchema); absent on every other line. */
const poolOf = (event: Event): Partial<Pick<LedgerEntry, 'tribe' | 'pool' | 'model'>> => {
  const [tribe, pool, model] = [textIn(event, 'tribe'), textIn(event, 'pool'), textIn(event, 'model')];
  return {
    ...(tribe === undefined ? {} : { tribe: tribe as TribeId }),
    ...(pool === undefined ? {} : { pool }),
    ...(model === undefined ? {} : { model }),
  };
};

/** The entry of one line: its quest, the character it is about (the view it carries, or the assignee) and who acted. */
function entryOf(event: Event, kind: LedgerKind, known: Known): LedgerEntry {
  const facts = event.quest === undefined ? undefined : known.quests.get(event.quest);
  const moved = movedIn(event);
  const character = moved === undefined ? refOf(known, facts?.assignee) : { id: moved.id, name: moved.name };
  const by = event.actor.id === character?.id ? undefined : refOf(known, event.actor.id);
  const territory = event.territory ?? facts?.territory;
  return {
    at: event.ts,
    kind,
    ...(event.quest === undefined ? {} : { quest: event.quest }),
    ...(facts === undefined ? {} : { title: facts.title }),
    ...(territory === undefined ? {} : { territory }),
    ...(character === undefined ? {} : { character }),
    ...(by === undefined ? {} : { by }),
    ...poolOf(event),
  };
}

const localDayOf = (zone: ZonedTime, ts: string): string | undefined => {
  const instant = parseInstant(ts);
  return instant.ok ? zone.format(instant.value).slice(0, LOCAL_DAY_LENGTH) : undefined;
};

/** The characters the entries name, each once, in order of first mention. */
function charactersOf(entries: readonly LedgerEntry[]): CharacterRef[] {
  const seen = new Map<CharacterId, CharacterRef>();
  for (const ref of entries.flatMap(({ character, by }) => [character, by]))
    if (ref !== undefined && !seen.has(ref.id)) seen.set(ref.id, ref);
  return [...seen.values()];
}

const countsOf = (entries: readonly LedgerEntry[]): ChronicleLedger['counts'] =>
  // Every kind of LEDGER_KINDS gets its count, as the schema's exhaustive record asks.
  Object.fromEntries(
    LEDGER_KINDS.map((kind) => [kind, entries.filter((entry) => entry.kind === kind).length]),
  ) as ChronicleLedger['counts'];

/**
 * The ledger of local day `day` (`yyyy-mm-dd`) in `world.tz`, from the whole log in order: the lines before the day
 * teach the names and titles its entries carry.
 */
export function dayLedgerOf(
  events: readonly Event[],
  world: LedgerWorld,
  day: string,
): Result<ChronicleLedger, LedgerError> {
  if (!LOCAL_DAY_PATTERN.test(day)) return err('invalid_day');
  const zone = zonedTime(world.tz);
  if (!zone.ok) return err('invalid_time_zone');
  const known: Known = {
    quests: new Map(world.quests.map((quest) => [quest.id, quest])),
    names: new Map(world.characters.map(({ id, name }) => [id, name])),
  };
  const entries: LedgerEntry[] = [];
  for (const event of events) {
    learn(known, event);
    const kind = LEDGER_TABLE.get(event.type);
    if (kind !== undefined && localDayOf(zone.value, event.ts) === day)
      entries.push(entryOf(event, kind, known));
  }
  const quests = new Set(entries.flatMap(({ quest }) => (quest === undefined ? [] : [quest])));
  return ok({
    version: 1,
    day,
    tz: world.tz,
    entries,
    counts: countsOf(entries),
    quests: quests.size,
    characters: charactersOf(entries),
  });
}
