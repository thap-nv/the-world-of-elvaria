// A stream client as the world and the phone will be (`ws` as the client, wave-1 plan P2-01c): it sends exactly the
// headers asked for, keeps every frame it received as text (so a spec can look for a secret in the bytes), and lets a
// spec await the next message of a type, or the close, instead of sleeping.
import { decodeServerMessage } from '@elvaria/domain';
import type { ServerMessage } from '@elvaria/domain';
import { WebSocket } from 'ws';

import { cookieOf, postCode } from './herald.ts';
import type { Device } from '@elvaria/domain';
import type { Harness } from './herald.ts';

type MessageOf<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

export interface Client {
  /** Every frame received, in order. */
  readonly texts: readonly string[];
  /** The next message of one of `types` after the last one taken; earlier ones of other types are passed over. */
  next<T extends ServerMessage['type']>(...types: T[]): Promise<MessageOf<T>>;
  /** A frame as text, exactly. */
  send(text: string): void;
  /** Resolves with the close code once the Herald or the client closed the stream. */
  readonly closed: Promise<number>;
  close(): void;
}

export type Opened =
  { readonly ok: true; readonly client: Client } | { readonly ok: false; readonly status: number };

export interface Dial {
  readonly cookie?: string;
  /** Default: the loopback origin of the port; null sends none. */
  readonly origin?: string | null;
  readonly host?: string;
  readonly path?: string;
}

function clientOf(socket: WebSocket): Client {
  const texts: string[] = [];
  const messages: ServerMessage[] = [];
  let taken = 0;
  let ended = false;
  let waiting: (() => void)[] = [];
  const wake = () => {
    const now = waiting;
    waiting = [];
    now.forEach((look) => {
      look();
    });
  };
  socket.on('message', (data: Buffer) => {
    const text = data.toString('utf8');
    texts.push(text);
    const decoded = decodeServerMessage(text);
    if (!decoded.ok) throw new Error(`the Herald sent a frame no client reads: ${text}`);
    messages.push(decoded.value);
    wake();
  });
  const closed = new Promise<number>((resolve) => {
    socket.on('close', (code) => {
      ended = true;
      wake();
      resolve(code);
    });
  });
  const next = <T extends ServerMessage['type']>(...types: T[]) =>
    new Promise<MessageOf<T>>((resolve, reject) => {
      const look = () => {
        const at = messages.findIndex(
          (message, index) => index >= taken && (types as string[]).includes(message.type),
        );
        if (at === -1) {
          if (ended) reject(new Error(`the stream closed before a ${types.join(' or ')} message`));
          else waiting.push(look);
          return;
        }
        taken = at + 1;
        resolve(messages[at] as MessageOf<T>);
      };
      look();
    });
  return {
    texts,
    next,
    send: (text) => {
      socket.send(text);
    },
    closed,
    close: () => {
      socket.close();
    },
  };
}

/** Opens a stream at `path` (default `/ws`) of the Herald on `port`; a refused upgrade gives its status. */
export function openClient(port: number, dial: Dial = {}): Promise<Opened> {
  const { cookie, host, path = '/ws' } = dial;
  const origin = dial.origin === undefined ? `http://127.0.0.1:${port}` : dial.origin;
  const headers = {
    ...(cookie === undefined ? {} : { Cookie: cookie }),
    ...(host === undefined ? {} : { Host: host }),
  };
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, {
    headers,
    ...(origin === null ? {} : { origin }),
  });
  // Listening before `open`: the first snapshot may come in the same chunk as the handshake's answer.
  const client = clientOf(socket);
  return new Promise((resolve) => {
    socket.once('unexpected-response', (_req, res) => {
      resolve({ ok: false, status: res.statusCode ?? 0 });
      socket.terminate();
    });
    socket.once('open', () => {
      resolve({ ok: true, client });
    });
    socket.once('error', () => {
      resolve({ ok: false, status: 0 });
    });
  });
}

/** A stream of `device`, paired through the loopback origin; throws when the Herald refuses it. */
export async function streamOf(h: Harness, device: Device, dial: Dial = {}): Promise<Client> {
  const cookie = cookieOf(await postCode(h.herald.port, await h.code(device)));
  const opened = await openClient(h.herald.port, { cookie, ...dial });
  if (!opened.ok) throw new Error(`the Herald refused the stream: ${opened.status}`);
  return opened.client;
}
