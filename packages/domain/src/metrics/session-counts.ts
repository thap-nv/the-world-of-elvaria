// What the metrics read about each session from the event log (PS-21, implementation-plan §3.16.1): how often it asked
// the code graph, how many tool calls it made before its first edit, and what its prompt carried. The A/B of PS-21
// compares sessions with and without the graph on these numbers; the goal's "57 % of calls before the first edit" was
// a count by hand, so it is counted from `agent.tool` lines, which old logs have too.
import { GRAPH_COMMANDS, graphCommandOf } from '../graph/commands.ts';
import { ROLES } from '../schema/common.ts';
import { isEventOf } from '../schema/event/event.ts';
import { PROMPT_PARTS } from '../schema/event/load-trace.ts';
import { inWindow } from './window.ts';
import type { MetricsWindow } from './window.ts';
import type { QuestId } from '../core/ids.ts';
import type { GraphCommand } from '../graph/commands.ts';
import type { Role } from '../schema/common.ts';
import type { Event, EventOf } from '../schema/event/event.ts';
import type { LoadTrace } from '../schema/event/load-trace.ts';
import type { Quest } from '../schema/quest/quest.ts';

const HALVES = 2;

/** The middle of `values`, which has one at least, rounded to a whole number. */
export function middleOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  // One middle value for an odd count, two for an even one.
  const middle = sorted.slice(Math.ceil(sorted.length / HALVES) - 1, Math.floor(sorted.length / HALVES) + 1);
  return Math.round(middle.reduce((total, value) => total + value, 0) / middle.length);
}

/** The middle of `values`, rounded to a whole number; null for none. */
export const medianOf = (values: readonly number[]): number | null =>
  values.length === 0 ? null : middleOf(values);

/** The role of each CLI session, from the attempt logs: a session the logs do not name has none here. */
export function sessionRolesOf(quests: readonly Quest[]): ReadonlyMap<string, Role> {
  const roles = new Map<string, Role>();
  for (const quest of quests)
    for (const entry of quest.attempt_log)
      if (entry.session_id !== undefined) roles.set(entry.session_id, entry.role);
  return roles;
}

export interface GraphCommandCount {
  readonly command: GraphCommand;
  readonly count: number;
}

export interface GraphQueries {
  /** `agent.tool` lines inside the window whose command is a graph command. */
  readonly total: number;
  /** The sessions that asked at least once (a line with no session is counted in the total only). */
  readonly sessions: number;
  readonly by_command: readonly GraphCommandCount[];
}

/** The code graph's queries (PS-21), next to the reads by file. */
export function graphQueriesOf(events: readonly Event[], window: MetricsWindow): GraphQueries {
  const counts = new Map<GraphCommand, number>();
  const sessions = new Set<string>();
  for (const event of events) {
    if (!isEventOf(event, 'agent.tool') || event.data.command === undefined) continue;
    const command = graphCommandOf(event.data.command);
    if (command === undefined || !inWindow(window, event.ts)) continue;
    counts.set(command, (counts.get(command) ?? 0) + 1);
    if (event.session !== undefined) sessions.add(event.session);
  }
  const by_command = GRAPH_COMMANDS.map((command) => ({ command, count: counts.get(command) ?? 0 }));
  return {
    total: by_command.reduce((total, { count }) => total + count, 0),
    sessions: sessions.size,
    by_command,
  };
}

/** One assignee session's tool calls, and how many came before its first edit. */
export interface FirstEdit {
  readonly session: string;
  readonly quest: QuestId | null;
  readonly calls: number;
  /** Calls before the first `write`; all of them when the session edited nothing. */
  readonly before: number;
  readonly edited: boolean;
}

export interface FirstEdits {
  /** Assignee sessions with a tool call inside the window, by session id. */
  readonly sessions: readonly FirstEdit[];
  /** Of them, those that edited a file. */
  readonly edited: number;
  /** Over the sessions that edited: the calls before the first edit, their median, and their share of all calls. */
  readonly median_before: number | null;
  readonly median_share_pct: number | null;
  /** Every call before a first edit over every call of those sessions, as the goal of PS-21 measured it. */
  readonly share_pct: number | null;
}

const percent = (part: number, whole: number): number => Math.round((100 * part) / whole);

function callsBySession(events: readonly Event[], roles: ReadonlyMap<string, Role>, window: MetricsWindow) {
  const sessions = new Map<
    string,
    { quest: QuestId | null; calls: number; before: number; edited: boolean }
  >();
  for (const event of events) {
    if (!isEventOf(event, 'agent.tool') || event.session === undefined) continue;
    if (roles.get(event.session) !== 'assignee' || !inWindow(window, event.ts)) continue;
    const seen = sessions.get(event.session) ?? {
      quest: event.quest ?? null,
      calls: 0,
      before: 0,
      edited: false,
    };
    const edited = seen.edited || event.data.tool === 'write';
    sessions.set(event.session, {
      quest: seen.quest,
      calls: seen.calls + 1,
      before: edited ? seen.before : seen.before + 1,
      edited,
    });
  }
  return sessions;
}

/** The calls each assignee session made before its first edit (PS-21); its role comes from the attempt logs. */
export function firstEditsOf(
  events: readonly Event[],
  quests: readonly Quest[],
  window: MetricsWindow,
): FirstEdits {
  const sessions = [...callsBySession(events, sessionRolesOf(quests), window)]
    .map(([session, counts]) => ({ session, ...counts }))
    .sort((a, b) => a.session.localeCompare(b.session));
  const edited = sessions.filter((entry) => entry.edited);
  const before = edited.reduce((total, entry) => total + entry.before, 0);
  const calls = edited.reduce((total, entry) => total + entry.calls, 0);
  return {
    sessions,
    edited: edited.length,
    median_before: medianOf(edited.map((entry) => entry.before)),
    median_share_pct: medianOf(edited.map((entry) => percent(entry.before, entry.calls))),
    share_pct: edited.length === 0 ? null : percent(before, calls),
  };
}

type PromptPart = LoadTrace['blocks'][number]['part'];

export interface PromptSize {
  readonly role: Role;
  readonly sessions: number;
  readonly median_chars: number;
  readonly max_chars: number;
}

export interface PromptBlockSize extends PromptSize {
  readonly part: PromptPart;
  readonly block: string;
}

export interface PromptSizes {
  /** The whole prompt (its blocks summed) per role, over the opening lines inside the window. */
  readonly roles: readonly PromptSize[];
  /** Each block per role and part, the biggest median first. */
  readonly blocks: readonly PromptBlockSize[];
}

type Opening = EventOf<'quest.started' | 'quest.unblocked' | 'quest.resumed'>;

const isOpening = (event: Event): event is Opening =>
  isEventOf(event, 'quest.started') ||
  isEventOf(event, 'quest.unblocked') ||
  isEventOf(event, 'quest.resumed');

/** The line's role: its session's in the attempt logs, else the quest's status (a judge opens on `review`). */
const roleOf = (event: Opening, roles: ReadonlyMap<string, Role>): Role =>
  (event.session === undefined ? undefined : roles.get(event.session)) ??
  (event.data.quest.status === 'review' ? 'verifier' : 'assignee');

const sizeOf = (role: Role, chars: readonly number[]): PromptSize => ({
  role,
  sessions: chars.length,
  median_chars: middleOf(chars),
  max_chars: Math.max(...chars),
});

const push = <K>(map: Map<K, number[]>, key: K, value: number): void => {
  map.set(key, [...(map.get(key) ?? []), value]);
};

/** Prompt size by block and by role (PS-21), read from the load trace of each opening line (PS-01b). */
export function promptSizesOf(
  events: readonly Event[],
  quests: readonly Quest[],
  window: MetricsWindow,
): PromptSizes {
  const roles = sessionRolesOf(quests);
  const totals = new Map<Role, number[]>();
  const blocks = new Map<string, number[]>();
  for (const event of events) {
    if (!isOpening(event) || event.data.load_trace === undefined || !inWindow(window, event.ts)) continue;
    const role = roleOf(event, roles);
    const trace = event.data.load_trace.blocks;
    push(
      totals,
      role,
      trace.reduce((total, { chars }) => total + chars, 0),
    );
    for (const { part, id, chars } of trace) push(blocks, JSON.stringify([role, part, id]), chars);
  }
  const rank = (role: Role, part: PromptPart): number =>
    ROLES.indexOf(role) * PROMPT_PARTS.length + PROMPT_PARTS.indexOf(part);
  return {
    roles: ROLES.flatMap((role) => {
      const chars = totals.get(role);
      return chars === undefined ? [] : [sizeOf(role, chars)];
    }),
    blocks: [...blocks]
      .map(([key, chars]) => {
        const [role, part, block] = JSON.parse(key) as [Role, PromptPart, string];
        return { ...sizeOf(role, chars), part, block };
      })
      .sort(
        (a, b) =>
          rank(a.role, a.part) - rank(b.role, b.part) ||
          b.median_chars - a.median_chars ||
          a.block.localeCompare(b.block),
      ),
  };
}
