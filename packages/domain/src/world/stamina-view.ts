// The stamina bar of each quest's running session, rebuilt from log lines alone (PS-28, docs/plans/session-stamina.md).
// Nothing keeps it, not the quest file and not WorldState: no file holds what a running session spent, so a field of the
// world state would break the replay of P0-09. A reader folds the lines of a journal, or of the day's log, in order:
// `agent.session.start` opens a full bar, `agent.session.usage` sets it, `agent.session.wrap_up` marks it reminded and
// `agent.session.end` closes it. The Steward's quest lines name whose seat a session holds (a start line does not), and
// say when the seat is empty, which closes a bar whose end line never came (§2.5: an open entry exists only while the
// quest is `working`, or in `review` with a judge).
import { barOf } from '../breaker/stamina.ts';
import { isEventOf, isTypedEvent } from '../schema/event/event.ts';
import type { Stamina, StaminaZone } from '../breaker/stamina.ts';
import type { CharacterId, QuestId } from '../core/ids.ts';
import type { Role } from '../schema/common.ts';
import type { EventData } from '../schema/event/event-data.ts';
import type { Event } from '../schema/event/event.ts';
import type { QuestView } from './quest-view.ts';

type Outcome = EventData<'agent.session.end'>['outcome'];

/** The ends that are a cut: the Steward's kill at a ceiling, or the CLI stopping at a ceiling of its own (settle.ts). */
const CUT_OUTCOMES: ReadonlySet<Outcome> = new Set(['killed', 'max_turns', 'budget']);

/** The session before this one in the same run, cut, and gone on from in this one (ADR 0030). */
export interface StaminaCut {
  readonly session: string;
  readonly outcome: Outcome;
  /** Its last notch line, gauge and percentage; undefined when it was cut before its first notch. */
  readonly stamina: Stamina | undefined;
}

export interface SessionStamina {
  readonly quest: QuestId;
  readonly session: string;
  /** Undefined until a quest line or a notch line says whose seat the session holds. */
  readonly role: Role | undefined;
  readonly character: CharacterId | undefined;
  /** The run (attempt_log n). */
  readonly attempt: number | undefined;
  /** 100 until the first notch line: a new session starts full. */
  readonly left_pct: number;
  readonly zone: StaminaZone;
  /** The bar of the latest notch line; undefined before the first. */
  readonly stamina: Stamina | undefined;
  /** `ts` of the latest notch line. */
  readonly at: string | undefined;
  /** The Steward wrote the reminder for this session (`agent.session.wrap_up`): not that the session read it. */
  readonly reminded: boolean;
  readonly previous: StaminaCut | undefined;
}

interface Ended {
  readonly session: string;
  readonly role: Role | undefined;
  readonly attempt: number | undefined;
  readonly outcome: Outcome;
  readonly stamina: Stamina | undefined;
  /** The quest went back for another session after it (`quest.returned`), as a cut that goes on does. */
  returned: boolean;
}

interface Bar {
  readonly quest: QuestId;
  readonly session: string;
  role: Role | undefined;
  character: CharacterId | undefined;
  attempt: number | undefined;
  stamina: Stamina | undefined;
  at: string | undefined;
  reminded: boolean;
  /** The quest's session that ended last when this one opened. */
  readonly before: Ended | undefined;
}

interface Fold {
  /** One session at most per quest: the Steward holds sessions by quest. */
  readonly open: Map<QuestId, Bar>;
  readonly ended: Map<QuestId, Ended>;
  /** Sessions whose end was read: a late notch or reminder line of theirs opens nothing. */
  readonly closed: Set<string>;
}

interface Key {
  readonly quest: QuestId;
  readonly session: string;
}

/** The view on a quest line; other lines naming a quest (memo.closed…) carry its id, not its view. */
function questViewOf(event: Event): QuestView | undefined {
  if (!isTypedEvent(event) || !event.type.startsWith('quest.') || !('quest' in event.data)) return undefined;
  const { quest } = event.data;
  return typeof quest === 'object' ? quest : undefined;
}

const seatOf = (view: QuestView): { role: Role; character: CharacterId | null } | undefined => {
  if (view.status === 'working') return { role: 'assignee', character: view.assignee };
  if (view.status === 'review' && view.verifier !== null)
    return { role: 'verifier', character: view.verifier };
  return undefined;
};

function seatGone(bar: Bar, view: QuestView): boolean {
  if (bar.role === 'verifier') return view.status !== 'review' || view.verifier === null;
  if (bar.role === 'assignee') return view.status !== 'working';
  return seatOf(view) === undefined;
}

/** The quest's bar for `session`: the one open, or a full one that takes the place of any other. */
function openBar(fold: Fold, { quest, session }: Key, attempt: number | undefined): Bar {
  const current = fold.open.get(quest);
  if (current?.session === session) return current;
  fold.closed.delete(session);
  const bar: Bar = {
    quest,
    session,
    role: undefined,
    character: undefined,
    attempt,
    stamina: undefined,
    at: undefined,
    reminded: false,
    before: fold.ended.get(quest),
  };
  fold.open.set(quest, bar);
  return bar;
}

function questLine(fold: Fold, event: Event & { readonly quest: QuestId }, view: QuestView): void {
  const bar = fold.open.get(event.quest);
  if (bar !== undefined && seatGone(bar, view)) fold.open.delete(event.quest);
  const ended = fold.ended.get(event.quest);
  if (ended !== undefined && event.type === 'quest.returned') ended.returned = true;
  const seat = seatOf(view);
  if (event.session === undefined || seat === undefined) return;
  const opened = openBar(fold, { quest: event.quest, session: event.session }, event.attempt);
  opened.role = seat.role;
  opened.character ??= seat.character ?? undefined;
}

function endLine(fold: Fold, { quest, session }: Key, outcome: Outcome): void {
  fold.closed.add(session);
  const bar = fold.open.get(quest);
  if (bar?.session !== session) return;
  fold.open.delete(quest);
  const { role, attempt, stamina } = bar;
  fold.ended.set(quest, { session, role, attempt, outcome, stamina, returned: false });
}

function sessionLine(fold: Fold, key: Key, event: Event): void {
  if (isEventOf(event, 'agent.session.start')) {
    openBar(fold, key, event.attempt).character ??= event.actor.id;
    return;
  }
  if (isEventOf(event, 'agent.session.end')) {
    endLine(fold, key, event.data.outcome);
    return;
  }
  // A notch or a reminder opens the bar of a session whose start the reader did not see (a journal's tail).
  if (fold.closed.has(key.session)) return;
  if (isEventOf(event, 'agent.session.usage')) {
    const bar = openBar(fold, key, event.attempt);
    bar.role = event.data.role;
    bar.stamina = barOf(event.data);
    bar.at = event.ts;
  } else if (isEventOf(event, 'agent.session.wrap_up')) {
    const bar = openBar(fold, key, event.attempt);
    // Only an assignee is ever reminded (wrap-up.ts of the Steward).
    bar.role ??= 'assignee';
    bar.reminded = true;
  }
}

/** A cut of the same run that went on (ADR 0030): an assignee's only, since a judge cut leaves the review to another. */
function previousOf({ before, session, role, attempt }: Bar): StaminaCut | undefined {
  if (before === undefined || before.session === session || !before.returned) return undefined;
  if (!CUT_OUTCOMES.has(before.outcome) || before.role !== 'assignee' || role !== 'assignee')
    return undefined;
  if (before.attempt !== attempt) return undefined;
  return { session: before.session, outcome: before.outcome, stamina: before.stamina };
}

const viewOf = (bar: Bar): SessionStamina => ({
  quest: bar.quest,
  session: bar.session,
  role: bar.role,
  character: bar.character,
  attempt: bar.attempt,
  left_pct: bar.stamina?.left_pct ?? 100,
  zone: bar.stamina?.zone ?? 'ok',
  stamina: bar.stamina,
  at: bar.at,
  reminded: bar.reminded,
  previous: previousOf(bar),
});

/**
 * The bar of each quest's open session, from `events` in log order (a journal, or the day's log). A line without a
 * quest or a session, a repeated line and a type this build does not know change nothing.
 */
export function sessionStaminaOf(events: readonly Event[]): Map<QuestId, SessionStamina> {
  const fold: Fold = { open: new Map(), ended: new Map(), closed: new Set() };
  for (const event of events) {
    const { quest, session } = event;
    if (quest === undefined) continue;
    const view = questViewOf(event);
    if (view !== undefined) questLine(fold, { ...event, quest }, view);
    else if (session !== undefined) sessionLine(fold, { quest, session }, event);
  }
  return new Map([...fold.open].map(([quest, bar]) => [quest, viewOf(bar)]));
}
