// Pairing codes and session ids: random bytes from the injected source, and only their SHA-256 on disk, compared in
// constant time (ADR 0031 items 2 and 3), so the files under .state/ open no session by themselves.
import { createHash, timingSafeEqual } from 'node:crypto';

import type { RandomSource } from '@elvaria/domain';

/** `count` random bytes as base64url: safe in a URL, a form field and a cookie without escaping. */
export const newSecret = (random: RandomSource, count: number): string =>
  Buffer.from(random.bytes(count)).toString('base64url');

/** The hex SHA-256 of a secret: what the Herald's files keep instead of it. */
export const hashOf = (secret: string): string => createHash('sha256').update(secret, 'utf8').digest('hex');

const HASH_HEX_LENGTH = 64;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

export const isHash = (value: unknown): value is string =>
  typeof value === 'string' && HASH_PATTERN.test(value);

/** Whether two hashes are equal, in time that does not depend on where they differ. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== HASH_HEX_LENGTH || b.length !== HASH_HEX_LENGTH) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/**
 * The first of `items` whose hash matches `secret`'s. Every item is compared, so the time taken says nothing about
 * which one matched, or how far a wrong one got.
 */
export function matchSecret<T extends { readonly hash: string }>(
  items: readonly T[],
  secret: string,
): T | undefined {
  const hash = hashOf(secret);
  let found: T | undefined;
  for (const item of items) {
    if (sameHash(item.hash, hash) && found === undefined) found = item;
  }
  return found;
}
