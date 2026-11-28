// Sessions (ADR 0031 item 3, amended by ADR 0037): `.state/herald-sessions.json` keeps the SHA-256 of each session id,
// the device it names, `created_at` and `last_seen_at`; only the Herald writes it. A session is valid while its hash
// matches, its device file exists without `revoked_at`, and it was used in the last 30 days. The device file is read
// again at every request, so `elvaria herald revoke` takes effect at the next one.
import { DeviceIdSchema, err, ok } from '@elvaria/domain';
import type { Clock, Device, DeviceId, Instant, RandomSource, Result } from '@elvaria/domain';
import type { KingdomStore } from '@elvaria/store';

import { SESSION_ID_BYTES, SESSION_IDLE_MS, SESSION_TOUCH_MS } from '../limit/limits.ts';
import { hashOf, isHash, matchSecret, newSecret } from '../secret/secret.ts';
import { readStateFile, updateStateFile } from '../state/state-file.ts';
import type { StateFile } from '../state/state-file.ts';

export const SESSIONS_FILE = '.state/herald-sessions.json';

export interface StoredSession {
  /** Hex SHA-256 of the session id; the id itself is only in the browser's cookie. */
  readonly hash: string;
  readonly device: DeviceId;
  readonly created_at: string;
  readonly last_seen_at: string;
}

interface SessionsData {
  readonly sessions: readonly StoredSession[];
}

const isTime = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

function storedSession(value: unknown): StoredSession | undefined {
  const entry = value as Partial<Record<keyof StoredSession, unknown>> | null;
  const device = DeviceIdSchema.safeParse(entry?.device);
  if (!isHash(entry?.hash) || !device.success || !isTime(entry.created_at) || !isTime(entry.last_seen_at))
    return undefined;
  return {
    hash: entry.hash,
    device: device.data,
    created_at: entry.created_at,
    last_seen_at: entry.last_seen_at,
  };
}

const SESSIONS: StateFile<SessionsData> = {
  file: SESSIONS_FILE,
  empty: () => ({ sessions: [] }),
  // An entry that does not read is dropped: it opens nothing.
  decode: (parsed) => {
    const list = (parsed as { sessions?: unknown }).sessions;
    if (!Array.isArray(list)) return undefined;
    return { sessions: list.map(storedSession).filter((entry) => entry !== undefined) };
  },
};

/** Every session the file holds, valid or not (`elvaria herald devices` shows when each device was last seen). */
export const readSessions = async (root: string): Promise<readonly StoredSession[]> =>
  (await readStateFile(root, SESSIONS)).sessions;

export interface SessionDeps {
  readonly store: KingdomStore;
  readonly clock: Clock;
  /** Times as kingdom files write them (the kingdom's offset). */
  readonly format: (at: Instant) => string;
  readonly random: RandomSource;
}

/** True once `at` lies more than `span` before `now`; a time that does not parse counts as long ago. */
const olderThan = (at: string, now: Instant, span: number): boolean => !(now - Date.parse(at) <= span);

/** Opens a session for `device` and returns its id, the one copy outside the hash; idle sessions are dropped. */
export async function openSession(deps: SessionDeps, device: DeviceId): Promise<Result<string, 'locked'>> {
  const id = newSecret(deps.random, SESSION_ID_BYTES);
  const now = deps.clock.now();
  const at = deps.format(now);
  const session: StoredSession = { hash: hashOf(id), device, created_at: at, last_seen_at: at };
  const written = await updateStateFile(deps.store.root, SESSIONS, ({ sessions }) => ({
    next: {
      sessions: [
        ...sessions.filter((entry) => !olderThan(entry.last_seen_at, now, SESSION_IDLE_MS)),
        session,
      ],
    },
    answer: id,
  }));
  return written;
}

export type SessionRefusal = 'no_session' | 'unknown_device' | 'device_revoked';

/** Writes `last_seen_at` of the session with `hash`, at most once per SESSION_TOUCH_MS. */
async function touch(deps: SessionDeps, session: StoredSession, now: Instant): Promise<void> {
  if (!olderThan(session.last_seen_at, now, SESSION_TOUCH_MS)) return;
  const seen = deps.format(now);
  // A lock held too long only skips this write: the session stays valid, its last use a little older.
  await updateStateFile(deps.store.root, SESSIONS, ({ sessions }) => ({
    next: {
      sessions: sessions.map((entry) =>
        entry.hash === session.hash ? { ...entry, last_seen_at: seen } : entry,
      ),
    },
    answer: undefined,
  }));
}

/** A valid session: its device, and when a pairing code opened it (SEC-08: a first passkey only soon after). */
export interface LiveSession {
  readonly device: Device;
  readonly opened_at: string;
}

/** The session id `cookie` names, while the session is valid (ADR 0031 item 4). */
export async function liveSession(
  deps: SessionDeps,
  cookie: string | undefined,
): Promise<Result<LiveSession, SessionRefusal>> {
  if (cookie === undefined || cookie === '') return err('no_session');
  const session = matchSecret(await readSessions(deps.store.root), cookie);
  const now = deps.clock.now();
  if (session === undefined || olderThan(session.last_seen_at, now, SESSION_IDLE_MS))
    return err('no_session');
  const device = await deps.store.devices.read(session.device);
  if (!device.ok) return err('unknown_device');
  if (device.value.revoked_at !== undefined) return err('device_revoked');
  await touch(deps, session, now);
  return ok({ device: device.value, opened_at: session.created_at });
}

/** The device the session id `cookie` names, while the session is valid. */
export async function sessionDevice(
  deps: SessionDeps,
  cookie: string | undefined,
): Promise<Result<Device, SessionRefusal>> {
  const live = await liveSession(deps, cookie);
  return live.ok ? ok(live.value.device) : live;
}
