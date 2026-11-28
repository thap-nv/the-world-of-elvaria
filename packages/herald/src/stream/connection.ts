// One stream (wave-1 plan P2-01c, W6): a `snapshot` when it opens, the attention queue, then `events` as the log
// grows. A device limited to territories gets them through the domain's scopeState, scopeEvents and scopeAttention,
// closed when unsure, plus the result lines of its own commands (command.applied, .rejected naming its device: the
// Steward writes them without a territory, so scopeEvents drops them; P2-01 (610) proposal). A line it does not get
// that changed what it sees (`resync`) is followed by a fresh snapshot. Every message goes through the Herald's
// redactor before it is encoded (threat model "Trước P2-01" 6). The device file is read again at every pulse: gone
// or revoked closes the stream, a new role or list of territories resends the snapshot.
import { encodeMessage, isEventOf, scopeAttention, scopeEvents, scopeState } from '@elvaria/domain';
import type { AttentionItem, Device, Event, ServerMessage, TerritoryId, WorldState } from '@elvaria/domain';
import { WebSocket } from 'ws';

import { STREAM_BUFFER_BYTES_MAX } from '../limit/limits.ts';
import type { FeedBatch, FeedView } from './world-feed.ts';

/** Close codes (RFC 6455 §7.4): 1008 a policy the client broke, 4401 the device may no longer stream. */
export const CLOSE = { policy: 1008, going_away: 1001, device_refused: 4401 } as const;

export interface Connection {
  readonly device: Device;
  /** Sends what the new lines show this device. */
  send(batch: FeedBatch, view: FeedView): void;
  /** The device file as read again: closes the stream when it is gone or revoked, resends when its grant changed. */
  recheck(device: Device | undefined, view: FeedView): void;
  /** Answers one of its commands. */
  reply(message: ServerMessage): void;
}

/** The territories a limited device sees; undefined for a full one. */
const territoriesOf = (device: Device): readonly TerritoryId[] | undefined =>
  device.role === 'full' ? undefined : device.territories;

const grantOf = (device: Device): string => JSON.stringify([device.role, territoriesOf(device) ?? []]);

/** A result line of a command this device sent. */
const ownResult = (event: Event, device: Device): boolean =>
  (isEventOf(event, 'command.applied') || isEventOf(event, 'command.rejected')) &&
  event.data.device === device.id;

/** The lines of `batch` the device receives, in order, and whether it needs a fresh snapshot after them. */
function linesFor(batch: FeedBatch, device: Device): { events: readonly Event[]; resync: boolean } {
  const territories = territoriesOf(device);
  if (territories === undefined) return { events: batch.events, resync: false };
  const scoped = scopeEvents(batch.events, batch.before, territories);
  const kept = new Map(scoped.events.map((event) => [event.id, event]));
  const events = batch.events.flatMap((event) => {
    const line = kept.get(event.id) ?? (ownResult(event, device) ? event : undefined);
    return line === undefined ? [] : [line];
  });
  return { events, resync: scoped.resync };
}

export interface ConnectionDeps {
  readonly redact: <T>(value: T) => T;
}

export function openConnection(
  socket: WebSocket,
  first: Device,
  view: FeedView,
  deps: ConnectionDeps,
): Connection {
  let device = first;
  let lastAttention = '';
  const post = (message: ServerMessage): void => {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > STREAM_BUFFER_BYTES_MAX) {
      socket.terminate();
      return;
    }
    socket.send(encodeMessage(deps.redact(message)));
  };
  const snapshot = (state: WorldState): void => {
    const territories = territoriesOf(device);
    post({ type: 'snapshot', state: territories === undefined ? state : scopeState(state, territories) });
  };
  const attention = ({ attention: items, state }: FeedView): void => {
    const territories = territoriesOf(device);
    const seen: readonly AttentionItem[] =
      territories === undefined ? items : scopeAttention(items, state, territories);
    const text = JSON.stringify(seen);
    if (text === lastAttention) return;
    lastAttention = text;
    post({ type: 'attention', items: [...seen] });
  };
  snapshot(view.state);
  attention(view);
  return {
    get device() {
      return device;
    },
    send: (batch, now) => {
      const lines = linesFor(batch, device);
      const [head, ...rest] = lines.events;
      if (head !== undefined) post({ type: 'events', events: [head, ...rest] });
      if (lines.resync) snapshot(now.state);
      if (batch.attentionChanged || lines.resync) attention(now);
    },
    recheck: (read, now) => {
      if (read === undefined || read.revoked_at !== undefined) {
        socket.close(CLOSE.device_refused, read === undefined ? 'unknown_device' : 'device_revoked');
        return;
      }
      const changed = grantOf(read) !== grantOf(device);
      device = read;
      if (!changed) return;
      snapshot(now.state);
      attention(now);
    },
    reply: post,
  };
}
