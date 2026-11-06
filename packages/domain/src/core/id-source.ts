// Ids come from injected time and randomness (ADR 0002): IO packages pass crypto random bytes, tests and the
// sandbox pass fixed or seeded bytes, and every id is built by the same pure code below.
import {
  BITS_PER_BASE32_CHAR,
  BYTE_BITS,
  CROCKFORD_ALPHABET,
  DATED_ID_RANDOM_CHARS,
  ULID_MAX_TIME_MS,
  ULID_RANDOM_BYTES,
  ULID_RANDOM_CHARS,
  ULID_TIME_CHARS,
} from '../constants.ts';
import { zonedTime } from './clock.ts';
import { ok } from './result.ts';
import type { Clock, Instant } from './clock.ts';
import type { CampaignId, LessonId, QuestId, Ulid } from './ids.ts';
import type { Result } from './result.ts';

export interface RandomSource {
  /** `count` uniformly random bytes. */
  bytes(count: number): Uint8Array;
}

export interface IdSource {
  /** Event and inbox command ids; strictly increasing within one source, even within one millisecond. */
  ulid(): Ulid;
  quest(): QuestId;
  campaign(): CampaignId;
  lesson(): LessonId;
}

const RADIX = BigInt(CROCKFORD_ALPHABET.length);
const RANDOM_BITS = BigInt(ULID_RANDOM_BYTES * BYTE_BITS);
const RANDOM_LIMIT = 1n << RANDOM_BITS;
const DATED_RANDOM_BYTES = Math.ceil((DATED_ID_RANDOM_CHARS * BITS_PER_BASE32_CHAR) / BYTE_BITS);

/** `value` as `length` Crockford base32 digits, most significant first. */
function base32(value: bigint, length: number): string {
  let digits = '';
  let rest = value;
  for (let index = 0; index < length; index += 1) {
    digits = `${CROCKFORD_ALPHABET.charAt(Number(rest % RADIX))}${digits}`;
    rest /= RADIX;
  }
  return digits;
}

const bigintOf = (bytes: Uint8Array): bigint =>
  bytes.reduce((acc, byte) => (acc << BigInt(BYTE_BITS)) | BigInt(byte), 0n);

/** A ULID: 48-bit time and 80 random bits, upper-case Crockford base32 (ulid spec). */
export function formatUlid(time: Instant, random: bigint): Ulid {
  const text = `${base32(BigInt(time), ULID_TIME_CHARS)}${base32(random, ULID_RANDOM_CHARS)}`;
  // base32 of a 48-bit time and an 80-bit number always matches ULID_PATTERN.
  return text.toUpperCase() as Ulid;
}

/** `<prefix>_<yyyymmdd>_<6 random base32>`, readable in logs and sorted by day (implementation-plan §2.1). */
export function formatDatedId(prefix: 'q' | 'c' | 'L', localDate: string, random: Uint8Array): string {
  const bits = bigintOf(random.subarray(0, DATED_RANDOM_BYTES));
  const spare = BigInt(DATED_RANDOM_BYTES * BYTE_BITS - DATED_ID_RANDOM_CHARS * BITS_PER_BASE32_CHAR);
  return `${prefix}_${localDate}_${base32(bits >> spare, DATED_ID_RANDOM_CHARS)}`;
}

export interface IdSourceDeps {
  clock: Clock;
  random: RandomSource;
  /** IANA zone of the kingdom: dated ids carry the local day, like event file names. */
  tz: string;
}

/** Fails only on an unknown time zone, so a bad `kingdom.tz` surfaces at start, not on the first id. */
export function createIdSource({ clock, random, tz }: IdSourceDeps): Result<IdSource, 'invalid_time_zone'> {
  const zoned = zonedTime(tz);
  if (!zoned.ok) return zoned;
  const { localDate } = zoned.value;
  let last = { time: -1, random: 0n };

  const ulid = (): Ulid => {
    const now = Math.min(clock.now(), ULID_MAX_TIME_MS);
    // Same millisecond, or a clock that stepped back: keep the last time and count up, so ids stay ordered.
    last =
      now > last.time
        ? { time: now, random: bigintOf(random.bytes(ULID_RANDOM_BYTES)) }
        : { time: last.time, random: (last.random + 1n) % RANDOM_LIMIT };
    // last.time came from a Clock and was clamped to the ULID range.
    return formatUlid(last.time as Instant, last.random);
  };

  const dated = (prefix: 'q' | 'c' | 'L'): string =>
    formatDatedId(prefix, localDate(clock.now()), random.bytes(DATED_RANDOM_BYTES));

  return ok({
    ulid,
    // formatDatedId with these prefixes produces exactly the quest, campaign and lesson patterns.
    quest: () => dated('q') as QuestId,
    campaign: () => dated('c') as CampaignId,
    lesson: () => dated('L') as LessonId,
  });
}
