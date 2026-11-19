// After the reminder (PS-28c, plans/session-stamina.md): per tribe, what the assignee sessions did once the Steward
// wrote them a wrap-up (the soft ceiling (F) of phase 2) — ended on their own, or went on until they were cut, and how
// many tokens and minutes they spent from the reminder to their end. It answers question (f) with numbers at 0 mana,
// and measures every later fix of a tribe's way of telling a session; whether the hook's words reached the model is
// not read here (no stdout, no transcript: PS-28d asks the CLI itself).
import { MS_PER_MINUTE } from '../constants.ts';
import { isEventOf } from '../schema/event/event.ts';
import { medianOf, middleOf } from './session-counts.ts';
import { inWindow } from './window.ts';
import type { MetricsWindow } from './window.ts';
import type { CharacterId, TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Event, EventOf } from '../schema/event/event.ts';

/** One tribe's sessions that were given a reminder and have ended. */
export interface AfterWrapUp {
  /** The tribe of the session's character; null when the line names no character the ledger read. */
  readonly tribe: TribeId | null;
  /** Sessions given a reminder whose end is in the log; `completed` and `cut` are of them, an `error` end is neither. */
  readonly reminded: number;
  /** Of them, the sessions that ended on their own: the stream's result said `completed`. */
  readonly completed: number;
  /** Of them, the sessions a ceiling or the Steward stopped: `killed`, `max_turns` or `budget`. */
  readonly cut: number;
  /**
   * The median of the tokens spent from the reminder to the end, over the sessions reminded on the token measure whose
   * end line has a usage; null when there is none. Minutes or turns say nothing about tokens.
   */
  readonly median_tokens: number | null;
  /** The median of the minutes from the reminder to the end. */
  readonly median_minutes: number;
}

/** The ends of a session that a ceiling or the Steward forced (the breaker's cut, the CLI's own ceiling, a kill). */
const CUT_OUTCOMES: ReadonlySet<string> = new Set(['killed', 'max_turns', 'budget']);

type WrapUpLine = EventOf<'agent.session.wrap_up'>;
type EndLine = EventOf<'agent.session.end'>;

interface Ended {
  readonly tribe: TribeId | null;
  readonly outcome: EndLine['data']['outcome'];
  readonly tokens: number | null;
  readonly ms: number;
}

function endedOf(wrap: WrapUpLine, end: EndLine, tribes: ReadonlyMap<CharacterId, TribeId>): Ended {
  const { actor, data } = end;
  const character = actor.kind === 'character' ? actor.id : undefined;
  // The reminder's `used` and the end's usage count tokens alike (breaker/tokens.ts): the difference is what the
  // session spent after it was told. A last count below the running one adds nothing.
  const tokens =
    wrap.data.measure === 'tokens' && data.usage !== undefined
      ? Math.max(0, data.usage.tokens - wrap.data.used)
      : null;
  return {
    tribe: (character === undefined ? undefined : tribes.get(character)) ?? null,
    outcome: data.outcome,
    tokens,
    ms: Math.max(0, Date.parse(end.ts) - Date.parse(wrap.ts)),
  };
}

/**
 * Each reminder written inside the window, paired with the first end line of its session that follows it. A session
 * still running has no end and is left out; a second reminder for one session (a restarted Steward) is the first one.
 */
function endedAfterWrapUp(
  events: readonly Event[],
  characters: readonly Pick<Character, 'id' | 'tribe'>[],
  window: MetricsWindow,
): Ended[] {
  const tribes = new Map(characters.map(({ id, tribe }) => [id, tribe]));
  const told = new Map<string, WrapUpLine>();
  const ended: Ended[] = [];
  for (const event of events) {
    const { session } = event;
    if (session === undefined) continue;
    if (isEventOf(event, 'agent.session.wrap_up')) {
      if (!told.has(session)) told.set(session, event);
      continue;
    }
    const wrap = told.get(session);
    if (wrap === undefined || !isEventOf(event, 'agent.session.end')) continue;
    told.delete(session);
    if (inWindow(window, wrap.ts)) ended.push(endedOf(wrap, event, tribes));
  }
  return ended;
}

function rowOf(tribe: TribeId | null, ended: readonly Ended[]): AfterWrapUp {
  return {
    tribe,
    reminded: ended.length,
    completed: ended.filter(({ outcome }) => outcome === 'completed').length,
    cut: ended.filter(({ outcome }) => CUT_OUTCOMES.has(outcome)).length,
    median_tokens: medianOf(ended.flatMap(({ tokens }) => (tokens === null ? [] : [tokens]))),
    median_minutes: middleOf(ended.map(({ ms }) => ms)) / MS_PER_MINUTE,
  };
}

/**
 * One row per tribe with a session reminded inside the window (the reminder's day) that has ended, in tribe order; a
 * tribe none of whose sessions was reminded has no row.
 */
export function afterWrapUpOf(
  events: readonly Event[],
  characters: readonly Pick<Character, 'id' | 'tribe'>[],
  window: MetricsWindow = {},
): AfterWrapUp[] {
  const byTribe = new Map<TribeId | null, Ended[]>();
  for (const ended of endedAfterWrapUp(events, characters, window))
    byTribe.set(ended.tribe, [...(byTribe.get(ended.tribe) ?? []), ended]);
  return [...byTribe]
    .sort(([a], [b]) => (a ?? '').localeCompare(b ?? ''))
    .map(([tribe, ended]) => rowOf(tribe, ended));
}
