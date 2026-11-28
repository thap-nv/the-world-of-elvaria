// The streams of `/ws` (wave-1 plan P2-01c) and the pulse that feeds them: every TAIL_INTERVAL_MS the log is read
// from its cursor (world-feed.ts), new lines go to each open stream, and each stream's device file is read again,
// even when no line came, so a revoke closes a stream within one pulse. The pulse is a plain loop over
// `EventLog.read`, not `tail`, which yields only when the log moves. Ceilings (limit/): the frame a client may send,
// the streams per device and in all, the bytes waiting on one stream, the commands a device sends a minute.
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';

import { err, ok } from '@elvaria/domain';
import type { Device, DeviceId, DeviceSource, IdSource, Instant, Result } from '@elvaria/domain';
import { WebSocketServer } from 'ws';
import type { RawData, WebSocket } from 'ws';

import { answerCommand } from '../command/command.ts';
import type { CommandDeps } from '../command/command.ts';
import { commandRate } from '../command/rate.ts';
import {
  FRAME_BYTES_MAX,
  STREAMS_MAX,
  STREAMS_PER_DEVICE_MAX,
  STREAM_CLOSE_GRACE_MS,
} from '../limit/limits.ts';
import { CLOSE, openConnection } from './connection.ts';
import { openWorldFeed } from './world-feed.ts';
import type { HeraldLog } from '../server/log.ts';
import type { Connection } from './connection.ts';
import type { FeedDeps, WorldFeed } from './world-feed.ts';

export interface StreamDeps extends FeedDeps {
  readonly format: (at: Instant) => string;
  readonly ids: Pick<IdSource, 'ulid'>;
  readonly log: HeraldLog;
  readonly intervalMs: number;
}

/** The device of an upgrade's session, through the origin it came from. */
interface Who {
  readonly device: Device;
  readonly source: DeviceSource;
}

/** A text frame as one string, however ws handed its bytes. */
function textOf(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return data instanceof ArrayBuffer ? Buffer.from(data).toString('utf8') : data.toString('utf8');
}

export interface Stream {
  /** Takes over the socket of an upgrade that passed the gate and the session; refused past the ceilings. */
  accept(
    upgrade: { readonly req: IncomingMessage; readonly socket: Duplex; readonly head: Buffer },
    who: Who,
  ): Result<void, 'too_many_streams'>;
  /** Stops the pulse and closes every stream. */
  close(): Promise<void>;
}

/** Waits `ms`; false once `signal` aborted. */
async function pause(ms: number, signal: AbortSignal): Promise<boolean> {
  try {
    await sleep(ms, undefined, { signal });
    return true;
  } catch {
    return false;
  }
}

/** Closes `socket` with 1001, dropping it if the client does not answer in time. */
function closeSocket(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    const drop = setTimeout(() => {
      socket.terminate();
    }, STREAM_CLOSE_GRACE_MS);
    socket.once('close', () => {
      clearTimeout(drop);
      resolve();
    });
    socket.close(CLOSE.going_away);
  });
}

/** One pulse: new lines to every stream, then every stream's device file read again. */
async function pulse(
  feed: WorldFeed,
  open: ReadonlyMap<WebSocket, Connection>,
  deps: StreamDeps,
): Promise<void> {
  const batch = await feed.poll();
  const view = feed.view();
  if (batch !== undefined) for (const connection of open.values()) connection.send(batch, view);
  const ids = new Set([...open.values()].map(({ device }) => device.id));
  const read = new Map<DeviceId, Device | undefined>();
  for (const id of ids) {
    const file = await deps.store.devices.read(id);
    read.set(id, file.ok ? file.value : undefined);
  }
  // A stream opened during the reads is checked at the next pulse; its upgrade has just read the file.
  for (const connection of open.values())
    if (read.has(connection.device.id)) connection.recheck(read.get(connection.device.id), feed.view());
}

async function run(feed: WorldFeed, open: Map<WebSocket, Connection>, deps: StreamDeps, signal: AbortSignal) {
  while (await pause(deps.intervalMs, signal)) {
    try {
      await pulse(feed, open, deps);
    } catch (error) {
      deps.log.write({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  }
}

interface Frame {
  readonly socket: WebSocket;
  readonly connection: Connection;
  readonly who: Who;
  readonly deps: CommandDeps & { readonly log: HeraldLog };
}

/** Answers one text frame on its stream; a frame without a ref to answer closes it. */
async function answerFrame({ socket, connection, who, deps }: Frame, text: string): Promise<void> {
  const sender = { device: who.device.id, source: who.source };
  try {
    const answered = await answerCommand(text, sender, deps);
    if (answered === undefined) {
      socket.close(CLOSE.policy, 'invalid_message');
      return;
    }
    const { reply, kind = '' } = answered;
    const answer = reply.type === 'refused' ? reply.reason : 'accepted';
    deps.log.write({ kind: 'command', device: sender.device, command: kind, answer });
    connection.reply(reply);
  } catch (error) {
    deps.log.write({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
  }
}

export async function openStream(deps: StreamDeps): Promise<Stream> {
  const feed = await openWorldFeed(deps);
  const rate = commandRate();
  const wss = new WebSocketServer({ noServer: true, maxPayload: FRAME_BYTES_MAX, perMessageDeflate: false });
  const open = new Map<WebSocket, Connection>();
  const controller = new AbortController();
  const running = run(feed, open, deps, controller.signal);
  const commandDeps = { ...deps, rate, view: () => feed.view() };

  const attach = (socket: WebSocket, who: Who) => {
    const connection = openConnection(socket, who.device, feed.view(), deps.log);
    open.set(socket, connection);
    deps.log.write({ kind: 'stream', device: who.device.id, open: true });
    socket.on('message', (data, binary) => {
      if (binary) socket.close(CLOSE.policy, 'text_only');
      else void answerFrame({ socket, connection, who, deps: commandDeps }, textOf(data));
    });
    socket.on('close', () => {
      open.delete(socket);
      deps.log.write({ kind: 'stream', device: who.device.id, open: false });
    });
    socket.on('error', () => {
      socket.terminate();
    });
  };

  return {
    accept: ({ req, socket, head }, who) => {
      const ofDevice = [...open.values()].filter(({ device }) => device.id === who.device.id).length;
      if (open.size >= STREAMS_MAX || ofDevice >= STREAMS_PER_DEVICE_MAX) return err('too_many_streams');
      wss.handleUpgrade(req, socket, head, (ws) => {
        attach(ws, who);
      });
      return ok(undefined);
    },
    close: async () => {
      controller.abort();
      await running;
      await Promise.all([...open.keys()].map(closeSocket));
      wss.close();
    },
  };
}
