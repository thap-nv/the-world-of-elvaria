// What a passkey signs for a command (ADR 0031 item 6, ADR 0038): the SHA-256 of its id, kind and payload, so a
// signature approves that one command. The id is the Herald's fresh ULID, so the same order given twice needs two
// signatures, and a signature copied into another command file fails; the file of the same id is applied once.
import type { InboxCommand } from '../schema/command/inbox-command.ts';
import { toBase64url } from './bytes.ts';
import type { PasskeyCrypto } from './crypto.ts';

const byKey = ([a]: readonly [string, unknown], [b]: readonly [string, unknown]): number => (a < b ? -1 : 1);

/**
 * JSON with each object's keys in code-unit order and its undefined fields left out: the Herald's parsed command and
 * the Steward's read of the file it wrote give the same text, whatever order either built the keys in.
 */
export function canonicalJson(value: unknown): string {
  // JSON has no undefined: an array holds null in its place, as JSON.stringify writes it.
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const fields = Object.entries(value).filter(([, field]) => field !== undefined);
    return `{${fields
      .sort(byKey)
      .map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export type SignedCommand = Pick<InboxCommand, 'id' | 'kind' | 'payload'>;

/** The challenge of `command`, base64url as clientDataJSON carries it and as the Herald hands it to the client. */
export const commandChallenge = (crypto: PasskeyCrypto, { id, kind, payload }: SignedCommand): string =>
  toBase64url(crypto.sha256(canonicalJson({ id, kind, payload })));
