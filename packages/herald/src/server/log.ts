// What the Herald tells its owner, through its own redactor (ADR 0031 item 7, ADR 0013): every pairing code and
// session id it has seen is a known value, masked wherever it would appear. Entries carry no path, query or header,
// so a code the Herald never saw (a guess in a URL) cannot reach the log either. The same redactor masks every
// message a stream sends (threat model "Trước P2-01" 6, P2-01c): the patterns of the event log, and those values.
import { createRedactor, redactDeep } from '@elvaria/eventlog';
import type { DeviceId } from '@elvaria/domain';
import type { Redactor } from '@elvaria/eventlog';

import type { HeraldRefusal } from './refusal.ts';

export type HeraldLogEntry =
  | { readonly kind: 'paired'; readonly device: DeviceId }
  | { readonly kind: 'refused'; readonly refusal: HeraldRefusal; readonly method: string }
  | { readonly kind: 'failed'; readonly message: string }
  /** A paired device opened a stream (`open`), or its stream ended. */
  | { readonly kind: 'stream'; readonly device: DeviceId; readonly open: boolean }
  /** A command of a stream: `answer` is `accepted` or the refusal's code. */
  | {
      readonly kind: 'command';
      readonly device: DeviceId;
      readonly command: string;
      readonly answer: string;
    };

export interface HeraldLog {
  /** From now on `secret` is masked in every entry. */
  remember(secret: string): void;
  write(entry: HeraldLogEntry): void;
  /** `value` with every secret masked, as the log would write it. */
  redact<T>(value: T): T;
}

/** Secrets kept for masking: enough for every code and session of a day, bounded against a flood of guesses. */
const REMEMBERED_MAX = 256;

export function heraldLog(sink: (entry: HeraldLogEntry) => void): HeraldLog {
  const known: string[] = [];
  let redactor: Redactor = createRedactor([]);
  return {
    remember: (secret) => {
      if (secret === '' || known.includes(secret)) return;
      known.push(secret);
      if (known.length > REMEMBERED_MAX) known.shift();
      redactor = createRedactor(known);
    },
    write: (entry) => {
      sink(redactDeep(entry, redactor));
    },
    redact: (value) => redactDeep(value, redactor),
  };
}
