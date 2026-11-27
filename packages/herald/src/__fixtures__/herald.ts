// A Herald on port 0 over a throwaway kingdom folder (a space in its name, implementation-plan §6), a clock the test
// moves, and a plain HTTP client that sends exactly the headers asked for (Host and Origin included), so every gate
// of ADR 0031 item 4 can be tried. No mana: nothing here talks to a CLI.
import { request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';

import { DeviceIdSchema, InstantSchema } from '@elvaria/domain';
import type { Clock, Device, Instant } from '@elvaria/domain';
import { openKingdom } from '@elvaria/store';
import type { KingdomStore } from '@elvaria/store';
import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';

import { issuePairingCode } from '../pairing/pairing.ts';
import { REFUSAL_STATUS } from '../server/refusal.ts';
import { startHerald } from '../server/server.ts';
import type { HeraldLogEntry } from '../server/log.ts';
import type { HeraldPages } from '../server/pages.ts';
import type { HeraldRefusal } from '../server/refusal.ts';
import type { HeraldOptions, RunningHerald } from '../server/server.ts';

export const START = InstantSchema.parse(Date.parse('2026-11-27T03:00:00Z'));

export interface MovableClock extends Clock {
  advance(ms: number): void;
}

export function movableClock(at: Instant = START): MovableClock {
  let now = at;
  return {
    now: () => now,
    advance: (ms) => {
      now = InstantSchema.parse(now + ms);
    },
  };
}

export const format = (at: Instant): string => new Date(at).toISOString();
export const random = { bytes: (count: number) => new Uint8Array(randomBytes(count)) };

export const PAGES: HeraldPages = {
  lang: 'en',
  title: 'Elvaria Herald',
  pairPrompt: 'Pair this browser?',
  pairButton: 'Pair',
  home: (device) => `This is ${device.label} (${device.role}).`,
  refusals: Object.fromEntries(
    Object.keys(REFUSAL_STATUS).map((refusal) => [refusal, `refused: ${refusal}`]),
  ) as Record<HeraldRefusal, string>,
};

export const deviceId = (suffix: string) => DeviceIdSchema.parse(`dev_20261127_${suffix}`);

export const fullDevice = (suffix = 'aaaaaa', label = 'Phone <one>'): Device => ({
  version: 1,
  id: deviceId(suffix),
  label,
  role: 'full',
  created_at: '2026-11-27T10:00:00+07:00',
});

export interface Harness {
  readonly dir: TempDir;
  readonly store: KingdomStore;
  readonly clock: MovableClock;
  readonly herald: RunningHerald;
  readonly logged: HeraldLogEntry[];
  /** A fresh code for `device`, as `elvaria herald pair` writes it. */
  code(device: Device): Promise<string>;
  stop(): Promise<void>;
}

export async function harness(overrides: Partial<HeraldOptions> = {}): Promise<Harness> {
  const dir = await tempDir('herald');
  const store = openKingdom(dir.root);
  const clock = movableClock();
  const logged: HeraldLogEntry[] = [];
  const started = await startHerald({
    store,
    port: 0,
    origins: ['https://elvaria.example.ts.net'],
    clock,
    format,
    random,
    pages: PAGES,
    log: (entry) => logged.push(entry),
    ...overrides,
  });
  if (!started.ok) throw new Error(`herald did not start: ${started.error.code}`);
  const herald = started.value;
  return {
    dir,
    store,
    clock,
    herald,
    logged,
    code: async (device) => {
      await store.devices.write(device);
      const issued = await issuePairingCode({ root: store.root, clock, format, random }, device.id);
      if (!issued.ok) throw new Error('pairing file locked');
      return issued.value.code;
    },
    stop: async () => {
      await herald.close();
      await dir.remove();
    },
  };
}

export interface Answer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

export interface Ask {
  readonly method?: string;
  readonly path?: string;
  /** Sent as given; `host` defaults to the loopback origin's. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export function ask(
  port: number,
  { method = 'GET', path = '/', headers = {}, body }: Ask = {},
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } },
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
    req.end(body);
  });
}

/** POST /pair with `code` from the loopback origin, as the pairing page's form sends it. */
export const postCode = (port: number, code: string, headers: Readonly<Record<string, string>> = {}) =>
  ask(port, {
    method: 'POST',
    path: '/pair',
    headers: {
      origin: `http://127.0.0.1:${port}`,
      'content-type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body: new URLSearchParams({ code }).toString(),
  });

/** The `name=value` part of the session cookie a pairing answer set. */
export function cookieOf(answer: Answer): string {
  const set = answer.headers['set-cookie'];
  const first = Array.isArray(set) ? set[0] : set;
  if (first === undefined) throw new Error('no cookie was set');
  return first.split(';')[0] ?? '';
}
