// kingdom.schedule: the Steward's scheduled jobs (implementation-plan §2.3, §3.16.3), out of kingdom.ts to keep it under
// the size limit (PS-26).
import { z } from 'zod';

import { SCHEDULE_DEFAULTS } from '../constants.ts';

const describe = (description: string) => ({ description });

/** A job the Steward runs once a day at `at`, the kingdom's local time (`HH:MM`, 24 hours). */
const TimeOfDaySchema = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);

const dailyJob = (enabled: boolean, at: string) =>
  z
    .strictObject({
      enabled: z.boolean().default(enabled),
      at: TimeOfDaySchema.default(at),
    })
    .prefault({});

export const ScheduleSchema = z
  .strictObject({
    chronicle: dailyJob(false, SCHEDULE_DEFAULTS.chronicle_at),
    // PS-03b; optional with defaults, as digest.
    triage: dailyJob(true, SCHEDULE_DEFAULTS.triage_at).meta(
      describe(
        "The Chancellor's triage of the memos waiting (PS-03b): at `at`, before the digest, one model call for the batch of memos sent to the Chancellor that nobody has decided or sent up yet, run outside the Steward's tick once no session of the Chancellor's tribe runs; none when no memo waits. Its result is inbox commands only, applied without the owner within `delegation`.",
      ),
    ),
    // PS-03; optional with defaults, so a kingdom.json written before it stays version 1.
    digest: dailyJob(true, SCHEDULE_DEFAULTS.digest_at).meta(
      describe(
        'The daily digest (PS-03): at `at` the Steward writes digest/YYYY-MM-DD.md, everything that waits for the owner in two groups (must decide for the work to go on, can wait), each item with advice and its CLI command, and rings the bell once. No model, no mana; once a day, whatever the clock does.',
      ),
    ),
    temple: z
      .strictObject({
        enabled: z.boolean().default(false),
        every_quests: z.int().min(1).default(SCHEDULE_DEFAULTS.temple_every_quests),
        weekly: z.boolean().default(true),
      })
      .prefault({}),
    // PS-26: `at` added after v1 with a default, so a kingdom.json written before it stays version 1.
    patrol: z
      .strictObject({
        enabled: z.boolean().default(false),
        at: TimeOfDaySchema.default(SCHEDULE_DEFAULTS.patrol_at),
        every: z
          .string()
          .regex(/^P(?:[0-9]+D)?(?:T(?:[0-9]+H)?(?:[0-9]+M)?)?$/)
          .default(SCHEDULE_DEFAULTS.patrol_every)
          .meta(
            describe(
              'ISO-8601 duration, read in whole days (P1D every day, P7D every week; a part of a day is dropped, at least one day): the patrol runs at `at` on a day this many days or more after the last day it ran.',
            ),
          ),
      })
      .prefault({})
      .meta(
        describe(
          "The patrol (PS-26): at `at`, outside the tick, for each git territory with `patrol`, commands.setup and every check on a clean plot at the head of its default branch, then the territory's scan scripts; one `patrol.ran` per territory. A check that turns red is one `base_red` item of the digest and one ring. No model, no mana.",
        ),
      ),
  })
  .meta({
    $comment:
      'Scheduled jobs run inside the Steward (no cron, Task Scheduler or launchd). The digest (PS-03) and the triage (PS-03b) have a runner and are on by default; the patrol (PS-26) has one and is off by default, since it runs every check of each territory it watches; chronicle and temple have none yet, so they default to disabled.',
  });
