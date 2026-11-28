// kingdom.schedule: the Steward's scheduled jobs (implementation-plan §2.3, §3.16.3), out of kingdom.ts to keep it under
// the size limit (PS-26).
import { z } from 'zod';

import { SCHEDULE_DEFAULTS } from './constants.ts';

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
    // P2-06 (W15): on by default, since the machine's chronicle runs no model. P2-06b (W10): `prose` added after v1
    // with a default, so a kingdom.json written before it stays version 1; on by default, as the owner chose.
    chronicle: z
      .strictObject({
        enabled: z.boolean().default(true),
        at: TimeOfDaySchema.default(SCHEDULE_DEFAULTS.chronicle_at),
        prose: z
          .boolean()
          .default(true)
          .meta(
            describe(
              "The Bard's prose (P2-06b). On, it SPENDS MANA: once a day, after the machine's part, one session with no tool of the roster's first character of class `bard`, on its own tribe and model (about 10 000 tokens: the day's ledger cut at 12 000 characters, prose under 600 words). Prose that names a quest the ledger lacks or a character idle that day is refused, tried once more with the errors, then dropped: the machine's part stands. No Bard, its pool closed, its tribe held, or a day with nothing in it: no model. On by default.",
            ),
          ),
      })
      .prefault({})
      .meta(
        describe(
          "The chronicle (P2-06): at `at` the Steward reads the day's ledger from the event log (quests done, returned, sealed, sent to the infirmary, delivered and merged; verdicts; levels; pools asleep and awake) and writes chronicle/YYYY-MM-DD.json and chronicle/YYYY-MM-DD.md, its counts and lists in the owner's language; a file already there is kept. The machine's part runs no model; once a day, then the Bard's `prose`.",
        ),
      ),
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
      .prefault({})
      .meta(
        describe(
          "The Temple (PS-12d, ADR 0027): a Monk's session reads the repeated failures of the last 50 judged runs and answers each at the lowest rung of the fix ladder: a proposal letter, a line of scripture, a word to the owner. Enabled, it SPENDS MANA: one session of the Monk's tribe (an evidence pack of at most 24 000 characters), at most once a day when `every_quests` runs were judged across the kingdom since the last run, or when `weekly` and a week passed with a new fail; and once for each character the Steward suspended for a fail streak. No repeated failure and no line to review: no model. Off by default.",
        ),
      ),
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
      "Scheduled jobs run inside the Steward (no cron, Task Scheduler or launchd). The digest (PS-03), the triage (PS-03b) and the chronicle (P2-06) have a runner and are on by default, the chronicle with the Bard's prose, which spends mana (P2-06b); the patrol (PS-26) has one and is off by default, since it runs every check of each territory it watches; the Temple (PS-12d) spends mana and is off by default.",
  });
