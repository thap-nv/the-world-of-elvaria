// What the metrics read (implementation-plan §3.16.1): the quests, their verdicts, the event log and the inbox
// commands the Steward handled. Gathered by quest here so the counting below never searches the whole kingdom.
import { isEventOf } from '../schema/event/event.ts';
import { OWNER_COMMAND_KINDS } from './causes.ts';
import { inWindow } from './window.ts';
import type { OwnerCommandKind } from './causes.ts';
import type { QuestTrail, TripAt } from './rework.ts';
import type { MetricsWindow } from './window.ts';
import type { QuestId } from '../core/ids.ts';
import type { InboxCommand, InboxCommandOf } from '../schema/command/inbox-command.ts';
import type { Event } from '../schema/event/event.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Verdict } from '../schema/quest/verdict.ts';

export interface MetricsInput {
  readonly quests: readonly Quest[];
  readonly verdicts: readonly Verdict[];
  /** The kingdom's own event log (not the sandbox's), in the order it was written. */
  readonly events: readonly Event[];
  /**
   * inbox/done: the commands the Steward handled. Only those with a `command.applied` line count; the file gives the
   * quest a command was on, and its kind to a line written before PS-01b, which names none.
   */
  readonly commands: readonly InboxCommand[];
}

/** An owner's command on a quest that the Steward applied. */
export interface OwnerCommand {
  readonly id: string;
  readonly kind: OwnerCommandKind;
  /** The quest it was on, from inbox/done; null when only its log line is left, which names no quest. */
  readonly quest: QuestId | null;
  /** When the owner wrote it, from inbox/done; else when the Steward applied it. */
  readonly ts: string;
}

const isOwnerKind = (kind: string): kind is OwnerCommandKind =>
  (OWNER_COMMAND_KINDS as readonly string[]).includes(kind);

const isOwnerCommand = (command: InboxCommand): command is InboxCommandOf<OwnerCommandKind> =>
  isOwnerKind(command.kind);

/** Each quest with its verdicts and its infirmary trips. */
export function trailsOf(input: MetricsInput): QuestTrail[] {
  const trips = new Map<string, TripAt[]>();
  for (const event of input.events) {
    if (!isEventOf(event, 'quest.infirmary') || event.quest === undefined || event.data.trip === undefined)
      continue;
    trips.set(event.quest, [...(trips.get(event.quest) ?? []), { at: event.ts, trip: event.data.trip }]);
  }
  return input.quests.map((quest) => ({
    quest,
    verdicts: input.verdicts.filter(({ quest_id }) => quest_id === quest.id),
    trips: trips.get(quest.id) ?? [],
  }));
}

/** The model each CLI session ran, from its `agent.session.start` line. */
export function sessionModelsOf(events: readonly Event[]): ReadonlyMap<string, string> {
  const models = new Map<string, string>();
  for (const event of events)
    if (isEventOf(event, 'agent.session.start')) models.set(event.data.session, event.data.model);
  return models;
}

/**
 * The owner's commands on quests that the Steward applied inside the window, one per `command.applied` line. The
 * line's `kind` decides when it has one (PS-01b), so a command whose file left inbox/done still counts; inbox/done
 * names the kind of an older line, and the quest of any.
 */
export function ownerCommandsOf(input: MetricsInput, window: MetricsWindow): OwnerCommand[] {
  const files = new Map(input.commands.map((command) => [command.id, command]));
  const seen = new Set<string>();
  return input.events.flatMap((event): OwnerCommand[] => {
    if (!isEventOf(event, 'command.applied') || seen.has(event.data.command_id)) return [];
    seen.add(event.data.command_id);
    const file = files.get(event.data.command_id);
    const kind = event.data.kind ?? file?.kind;
    const ts = file?.ts ?? event.ts;
    if (kind === undefined || !isOwnerKind(kind) || !inWindow(window, ts)) return [];
    const quest = file !== undefined && isOwnerCommand(file) ? file.payload.quest : null;
    return [{ id: event.data.command_id, kind, quest, ts }];
  });
}

/**
 * Sessions that followed the first inside one attempt (`sequels` on the line that tells a session's end, P1-49): the
 * attempt log has one entry for them all, so they are counted from the event log.
 */
export function sequelsIn(events: readonly Event[], window: MetricsWindow): number {
  return events.reduce((total, event) => {
    const { sequels } = event.data;
    return Array.isArray(sequels) && inWindow(window, event.ts) ? total + sequels.length : total;
  }, 0);
}
