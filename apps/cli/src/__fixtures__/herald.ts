// The browser side of the Herald for the specs of `elvaria herald` and `elvaria sandbox replay --to herald` (P2-01b,
// P2-01c): one HTTP request with exactly the headers given, a world stream with `ws` as the client, and an io whose
// owner presses Ctrl+C only when the test says.
import { request } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';

import { WebSocket } from 'ws';

import { testIo } from './cli.ts';
import type { TestIo } from './cli.ts';
export interface Answer {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

/** One request with exactly these headers (Node adds Host); redirects are not followed. */
export function send(
  origin: string,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Answer> {
  const url = new URL(path, origin);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: init.method ?? 'GET',
        headers: init.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.end(init.body);
  });
}

export type Message = Readonly<Record<string, unknown>> & { readonly type: string };

/** A world stream of the session `cookie`: the first message of a type, a frame to send, and how it closed. */
export function worldStream(origin: string, cookie: string) {
  const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/ws`, {
    origin,
    headers: { Cookie: cookie },
  });
  const messages: Message[] = [];
  let waiting: (() => void)[] = [];
  socket.on('message', (data: Buffer) => {
    messages.push(JSON.parse(data.toString('utf8')) as Message);
    const now = waiting;
    waiting = [];
    now.forEach((look) => {
      look();
    });
  });
  /** Resolves with what `seen` makes of the messages so far, once it is defined. */
  const once = <T>(seen: () => T | undefined) =>
    new Promise<T>((resolve) => {
      const look = () => {
        const found = seen();
        if (found === undefined) waiting.push(look);
        else resolve(found);
      };
      look();
    });
  const first = (type: string) => once(() => messages.find((message) => message.type === type));
  /** The ids of the lines of every `events` message, once there are at least `count`. */
  const lines = (count: number) =>
    once(() => {
      const ids = messages
        .filter((message) => message.type === 'events')
        .flatMap((message) => (message.events as readonly { readonly id: string }[]).map(({ id }) => id));
      return ids.length >= count ? ids : undefined;
    });
  const closed = new Promise<number>((resolve) => socket.on('close', resolve));
  const opened = new Promise<void>((resolve) =>
    socket.once('open', () => {
      resolve();
    }),
  );
  return {
    first,
    lines,
    closed,
    opened,
    send: (value: unknown) => {
      socket.send(JSON.stringify(value));
    },
  };
}

/** An io whose owner presses Ctrl+C only when the test says, and which says when the Herald listens. */
export function heldIo(): { io: TestIo; listening: Promise<void>; stop: () => void } {
  let ready = (): void => undefined;
  let stop = (): void => undefined;
  const listening = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const stopped = new Promise<void>((resolve) => {
    stop = resolve;
  });
  const io = testIo({
    untilStopped: () => {
      ready();
      return stopped;
    },
  });
  return { io, listening, stop };
}
