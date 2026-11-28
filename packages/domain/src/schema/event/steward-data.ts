// `data` of the lines a Steward writes about itself (LL-04, plans/learning-loop.md §4.3): when it starts, what the
// log says of the one before, and when it stops. A start whose last steward.* line is a start, not a stop, follows a
// Steward that died halfway (L35); a stop with sessions running cut their work (L25). New types, so `v` stays 2.
import { z } from 'zod';

import { CommitShaSchema } from './upgrade-data.ts';

const describe = (description: string) => ({ description });

/**
 * How the Steward before this one ended, as the log says it: `first`, no steward.* line before (a new kingdom, or
 * the first start of a build that writes them); `clean`, its last line is a steward.stopped; `unclean`, a
 * steward.started, so that Steward died without its stop (killed, a crash, the machine off).
 */
export const STEWARD_PREVIOUS = ['first', 'clean', 'unclean'] as const;
export type StewardPrevious = (typeof STEWARD_PREVIOUS)[number];

/**
 * Why a Steward stopped: `owner`, Ctrl+C in its terminal (SIGINT, on Windows and macOS); `signal`, a SIGTERM sent to
 * it (macOS `kill`, or the launcher of the pinned build passing one on). Windows sends no SIGTERM: a process killed
 * there writes no stop, and the next start says `unclean`.
 */
export const STEWARD_STOP_REASONS = ['owner', 'signal'] as const;
export type StewardStopReason = (typeof STEWARD_STOP_REASONS)[number];

export const StewardStartedDataSchema = z
  .strictObject({
    build: CommitShaSchema.nullable().meta(
      describe(
        'The pinned build this Steward runs (`.builds/<sha>/`); null when it runs from a source tree.',
      ),
    ),
    previous: z.enum(STEWARD_PREVIOUS),
    down_minutes: z
      .int()
      .min(0)
      .optional()
      .meta(
        describe(
          'With previous clean: whole minutes since its steward.stopped; unclean: since the last line of the log before this start, the most the kingdom can have been down. Absent with first.',
        ),
      ),
  })
  .refine((data) => (data.previous === 'first') === (data.down_minutes === undefined), {
    path: ['down_minutes'],
    message: 'a start after another Steward says how long the kingdom was down, a first start does not',
  })
  .meta(
    describe(
      "A Steward took the kingdom's lock and read the log, before its first tick (LL-04). Actor `steward`, no quest.",
    ),
  );

export const StewardStoppedDataSchema = z
  .strictObject({
    reason: z.enum(STEWARD_STOP_REASONS),
    sessions: z
      .int()
      .min(0)
      .meta(
        describe(
          'Sessions still running when the stop began: the stop killed them, and their runs are lost.',
        ),
      ),
  })
  .meta(
    describe(
      'A Steward stopped: sessions, checks and jobs killed, the lock about to go (LL-04). The last line it writes.',
    ),
  );

/** The Steward's own lines, spread into EVENT_DATA_SCHEMAS. */
export const STEWARD_EVENT_DATA = {
  'steward.started': StewardStartedDataSchema,
  'steward.stopped': StewardStoppedDataSchema,
} as const;
