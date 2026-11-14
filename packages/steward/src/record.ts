// The Steward's pen: the only code that writes quest and character files (ADR 0005). Every change goes through
// transition() or transitionCharacter(), is written to its file, then told in one event line carrying the view
// after it (implementation-plan §2.3, P0-09), so reduce(log) rebuilds what the files say. Files first: a line
// lost in a crash costs nothing once the next line of that quest arrives; a line without its file would lie.
import {
  EVENT_VERSION,
  EventSchema,
  characterViewOf,
  currentRun,
  err,
  ok,
  questLogTypeOf,
  questViewOf,
  transition,
  transitionCharacter,
} from '@elvaria/domain';
import { createRedactor, openJournal, redactDeep } from '@elvaria/eventlog';
import type {
  Actor,
  Character,
  CharacterEvent,
  CharacterId,
  Event,
  IdSource,
  LoadTrace,
  Quest,
  QuestActor,
  QuestEvent,
  QuestId,
  Result,
  TerritoryId,
} from '@elvaria/domain';
import type { EventLog } from '@elvaria/eventlog';
import type { KingdomStore } from '@elvaria/store';

import { OUT_OF_ATTEMPTS, infirmaryData } from './infirmary.ts';
import { describeIssue } from './world.ts';
import type { InfirmaryCause } from './infirmary.ts';
import type { Logger } from './types.ts';
import type { World } from './world.ts';

/** A change to a character that a quest move brings along (§2.6), at the time of the move. */
export type CharacterEdit = (character: Character, at: string) => Result<Character, unknown>;
export type Edits = Readonly<Partial<Record<CharacterId, CharacterEdit>>>;

// Distributive over the union, so a payload is checked against the event of its own type.
type WithoutAt<T> = T extends unknown ? Omit<T, 'at'> : never;
export type MovePayload = WithoutAt<QuestEvent>;

export interface Move {
  readonly quest: QuestId;
  readonly event: MovePayload;
  readonly actor: QuestActor;
  readonly edits?: Edits;
  /** Fields set before the event, e.g. the plot a start prepared (no event of the table writes it). */
  readonly before?: Partial<Quest>;
  /** Why, should the move land in the infirmary (§3.4, P1-32); OUT_OF_ATTEMPTS when it does not say. */
  readonly infirmary?: InfirmaryCause;
  /**
   * What the prompt of the session this move opens carried (PS-01b, §3.16.1): on the line only, as `sequels` is; the
   * quest file and attempt_log stay as they were.
   */
  readonly load_trace?: LoadTrace;
  /** On a submit, the files the work changed outside the quest's scope (PS-05): on the line only, as `load_trace`. */
  readonly out_of_scope?: readonly string[];
}

/** A line about something the files do not keep: verdict.*, command.*. */
export interface Line {
  readonly type: string;
  readonly actor: Actor;
  readonly data: Readonly<Record<string, unknown>>;
  readonly quest?: Quest;
  readonly session?: string | undefined;
  /** The territory of a line with no quest (graph.*, PS-21); a quest's line takes its quest's. */
  readonly territory?: TerritoryId;
}

export interface Recorder {
  /** ISO 8601 in kingdom.tz: the time every file and line of this step carries. */
  stamp(): string;
  move(move: Move): Promise<Result<Quest, string>>;
  /** A new or edited quest file, and its line (quest.created, quest.drafted, quest.edited). */
  put(
    quest: Quest,
    type: 'quest.created' | 'quest.drafted' | 'quest.edited',
    actor: Actor,
  ): Promise<Result<Quest, string>>;
  /**
   * A character change with no quest move: character.swamp, character.level_up, character.level_down, and the
   * owner's character.suspend and character.release, told as the owner's (`actor`; the Steward by default).
   */
  change(
    id: CharacterId,
    type: `character.${string}`,
    edit: CharacterEdit,
    actor?: Actor,
  ): Promise<Result<Character, string>>;
  note(line: Line): Promise<void>;
}

export const STEWARD: Actor = { kind: 'steward' };
export const OWNER: Actor = { kind: 'user' };
/** The Chancellor's triage of memos (PS-03b): its commands are told as its own, not the owner's. */
export const CHANCELLOR: Actor = { kind: 'chancellor' };

/** Who an inbox command speaks for: the Chancellor's triage, or the owner through one of its clients. */
export const actorOfCommand = (command: { readonly source: string }): Actor =>
  command.source === 'chancellor' ? CHANCELLOR : OWNER;

/** The character after one event of its state machine (§2.6). */
export const step =
  (type: CharacterEvent['type'], quest?: QuestId): CharacterEdit =>
  (character, at) =>
    transitionCharacter(
      character,
      (quest === undefined ? { type, at } : { type, at, quest }) as CharacterEvent,
    );

/** Who a quest move is by, as the line says it. */
function actorOf(actor: QuestActor, quest: Quest): Actor {
  if (actor === 'user') return OWNER;
  const holder = actor === 'runner' ? quest.assignee : actor === 'verifier' ? quest.verifier : null;
  return typeof holder === 'string' ? { kind: 'character', id: holder } : STEWARD;
}

export interface RecorderDeps {
  readonly world: World;
  readonly store: KingdomStore;
  readonly events: EventLog;
  readonly ids: IdSource;
  readonly log: Logger;
  readonly stamp: () => string;
}

const reasonOf = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'refused';

/** Redacted (ADR 0013), checked by the event schema, appended to the log and to the quest's journal. */
async function append(deps: RecorderDeps, line: Line, ts: string): Promise<void> {
  const run = line.quest === undefined ? 0 : currentRun(line.quest);
  const draft = {
    v: EVENT_VERSION,
    id: deps.ids.ulid(),
    ts,
    type: line.type,
    actor: line.actor,
    ...(line.quest === undefined ? {} : { quest: line.quest.id, territory: line.quest.territory }),
    ...(line.quest === undefined && line.territory !== undefined ? { territory: line.territory } : {}),
    ...(run > 0 ? { attempt: run } : {}),
    ...(line.session === undefined ? {} : { session: line.session }),
    data: line.data,
  };
  const event: Event = EventSchema.parse(redactDeep(draft, createRedactor([])));
  await deps.events.append([event]);
  // The quest's journal carries its own lines too: a revived session reads its tail (ADR 0010, 0017).
  if (line.quest !== undefined) await openJournal(deps.store.root, line.quest.id).append([event]);
}

function editAll(world: World, edits: Edits, at: string): Result<Character[], string> {
  const moved: Character[] = [];
  for (const [id, edit] of Object.entries(edits)) {
    const before = world.characters.get(id as CharacterId);
    if (before === undefined || edit === undefined) return err(`unknown_character:${id}`);
    const after = edit(before, at);
    if (!after.ok) return err(`${id}:${reasonOf(after.error)}`);
    moved.push(after.value);
  }
  return ok(moved);
}

async function save(
  deps: RecorderDeps,
  quest: Quest | undefined,
  characters: readonly Character[],
): Promise<Result<void, string>> {
  if (quest !== undefined) {
    const written = await deps.store.quests.write(quest);
    if (!written.ok) return err(describeIssue(written.error));
    deps.world.quests.set(quest.id, written.value);
  }
  for (const character of characters) {
    const written = await deps.store.characters.write(character);
    if (!written.ok) return err(describeIssue(written.error));
    deps.world.characters.set(character.id, written.value);
  }
  return ok(undefined);
}

async function move(deps: RecorderDeps, request: Move): Promise<Result<Quest, string>> {
  const at = deps.stamp();
  const found = deps.world.quests.get(request.quest);
  if (found === undefined) return err('unknown_quest');
  const event: QuestEvent = { ...request.event, at };
  const after = transition({ ...found, ...request.before }, event, request.actor);
  if (!after.ok) return err(after.error.code);
  const moved = editAll(deps.world, request.edits ?? {}, at);
  if (!moved.ok) return moved;
  const saved = await save(deps, after.value, moved.value);
  if (!saved.ok) {
    deps.log.warn(`steward: ${request.quest} ${event.type}: ${saved.error}`);
    return saved;
  }
  const type = questLogTypeOf(event.type, found.status, after.value.status);
  const session = 'session_id' in event ? event.session_id : undefined;
  // The sessions that followed the first in the run that ends here (P1-49): attempt_log keeps one entry for them all.
  const sequels = 'sequels' in event ? event.sequels : undefined;
  const data = {
    ...(type === 'quest.infirmary' ? infirmaryData(request.infirmary ?? OUT_OF_ATTEMPTS) : {}),
    quest: questViewOf(after.value),
    ...(moved.value.length > 0 ? { characters: moved.value.map(characterViewOf) } : {}),
    ...(sequels === undefined || sequels.length === 0 ? {} : { sequels }),
    ...(request.load_trace === undefined ? {} : { load_trace: request.load_trace }),
    ...(request.out_of_scope === undefined || request.out_of_scope.length === 0
      ? {}
      : { out_of_scope: request.out_of_scope }),
  };
  await append(deps, { type, actor: actorOf(request.actor, found), data, quest: after.value, session }, at);
  return ok(after.value);
}

interface Change {
  readonly id: CharacterId;
  readonly type: string;
  readonly edit: CharacterEdit;
  readonly actor: Actor;
}

async function change(
  deps: RecorderDeps,
  { id, type, edit, actor }: Change,
): Promise<Result<Character, string>> {
  const at = deps.stamp();
  const before = deps.world.characters.get(id);
  if (before === undefined) return err(`unknown_character:${id}`);
  const after = edit(before, at);
  if (!after.ok) return err(`${id}:${reasonOf(after.error)}`);
  const saved = await save(deps, undefined, [after.value]);
  if (!saved.ok) return saved;
  await append(deps, { type, actor, data: { character: characterViewOf(after.value) } }, at);
  return ok(after.value);
}

export function createRecorder(deps: RecorderDeps): Recorder {
  return {
    stamp: deps.stamp,
    move: (request) => move(deps, request),
    put: async (quest, type, actor) => {
      const at = deps.stamp();
      const saved = await save(deps, quest, []);
      if (!saved.ok) return saved;
      await append(deps, { type, actor, data: { quest: questViewOf(quest) }, quest }, at);
      return ok(quest);
    },
    change: (id, type, edit, actor = STEWARD) => change(deps, { id, type, edit, actor }),
    note: (line) => append(deps, line, deps.stamp()),
  };
}
