// Pairing codes (ADR 0031 item 2): `elvaria herald pair` writes the hash of a fresh code, the device it pairs and when
// it expires into `.state/herald-pairing.json`, under the file's lock; the Herald trades a matching code for a session
// once and drops it. Five wrong codes drop every pending code and close pairing until the next `herald pair`.
import { DeviceIdSchema, err, ok } from '@elvaria/domain';
import type { Clock, DeviceId, Instant, RandomSource, Result } from '@elvaria/domain';

import { PAIRING_CODE_BYTES, PAIRING_CODE_TTL_MS, PAIRING_FAILURES_MAX } from '../limit/limits.ts';
import { hashOf, isHash, matchSecret, newSecret } from '../secret/secret.ts';
import { updateStateFile } from '../state/state-file.ts';
import type { StateFile } from '../state/state-file.ts';

export const PAIRING_FILE = '.state/herald-pairing.json';

interface PendingCode {
  readonly hash: string;
  readonly device: DeviceId;
  readonly expires_at: string;
}

interface PairingData {
  readonly codes: readonly PendingCode[];
  /** Wrong codes since the last `herald pair`. */
  readonly failures: number;
}

function pendingCode(value: unknown): PendingCode | undefined {
  const entry = value as Partial<Record<keyof PendingCode, unknown>> | null;
  const device = DeviceIdSchema.safeParse(entry?.device);
  if (!isHash(entry?.hash) || !device.success || typeof entry.expires_at !== 'string') return undefined;
  return { hash: entry.hash, device: device.data, expires_at: entry.expires_at };
}

const PAIRING: StateFile<PairingData> = {
  file: PAIRING_FILE,
  empty: () => ({ codes: [], failures: 0 }),
  decode: (parsed) => {
    const { codes, failures } = parsed as { codes?: unknown; failures?: unknown };
    if (!Array.isArray(codes) || !Number.isInteger(failures)) return undefined;
    return {
      codes: codes.map(pendingCode).filter((code) => code !== undefined),
      failures: failures as number,
    };
  },
};

/** Codes still good at `now`; an expiry that does not parse has passed. */
const live = (codes: readonly PendingCode[], now: Instant): PendingCode[] =>
  codes.filter((code) => now < Date.parse(code.expires_at));

export interface IssueDeps {
  readonly root: string;
  readonly clock: Clock;
  readonly format: (at: Instant) => string;
  readonly random: RandomSource;
}

export interface IssuedCode {
  /** The code itself: printed once, never written. */
  readonly code: string;
  readonly expires_at: string;
}

/** A fresh code for `device`; it also reopens pairing after five wrong codes (ADR 0031 item 2). */
export async function issuePairingCode(
  deps: IssueDeps,
  device: DeviceId,
): Promise<Result<IssuedCode, 'locked'>> {
  const code = newSecret(deps.random, PAIRING_CODE_BYTES);
  const now = deps.clock.now();
  const expires = deps.format((now + PAIRING_CODE_TTL_MS) as Instant);
  return updateStateFile(deps.root, PAIRING, ({ codes }) => ({
    next: { codes: [...live(codes, now), { hash: hashOf(code), device, expires_at: expires }], failures: 0 },
    answer: { code, expires_at: expires },
  }));
}

export type PairingRefusal = 'code_refused' | 'pairing_closed';

/**
 * The device `code` pairs, once: a match is dropped as it is used. A wrong, used or expired code counts as one
 * failure, and the fifth drops every pending code; the answer never says which of the three it was.
 */
export async function redeemPairingCode(
  root: string,
  code: string,
  clock: Clock,
): Promise<Result<DeviceId, PairingRefusal | 'locked'>> {
  const now = clock.now();
  const settled = await updateStateFile(
    root,
    PAIRING,
    ({ codes, failures }): { next?: PairingData; answer: Result<DeviceId, PairingRefusal> } => {
      if (failures >= PAIRING_FAILURES_MAX) return { answer: err('pairing_closed') };
      const pending = live(codes, now);
      const found = matchSecret(pending, code);
      if (found !== undefined)
        return {
          next: { codes: pending.filter((entry) => entry !== found), failures },
          answer: ok(found.device),
        };
      const wrong = failures + 1;
      const closed = wrong >= PAIRING_FAILURES_MAX;
      return {
        next: { codes: closed ? [] : pending, failures: wrong },
        answer: err(closed ? 'pairing_closed' : 'code_refused'),
      };
    },
  );
  return settled.ok ? settled.value : settled;
}
