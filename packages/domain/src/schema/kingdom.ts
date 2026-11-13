// kingdom.json v1: the owner's settings for one kingdom (implementation-plan §2.3).
import { z } from 'zod';

import {
  BREAKER_DEFAULTS,
  DISPATCH_DEFAULTS,
  MANA_DEFAULTS,
  MANA_MARGIN_MAX_PCT,
  MINUTES_PER_DAY,
  SCHEDULE_DEFAULTS,
} from '../constants.ts';
import { isTimeZone } from '../core/clock.ts';
import {
  AbsPathSchema,
  DateTimeSchema,
  GENERATED_NOTE,
  NameSchema,
  RankSchema,
  rejectDuplicateIds,
} from './common.ts';
import { DelegationSchema } from './delegation.ts';
import { ProgramsSchema } from './program.ts';
import { TribeSchema } from './tribe.ts';

const describe = (description: string) => ({ description });

const ManaSchema = z
  .strictObject({
    cap_pct: z.number().min(1).max(100).default(MANA_DEFAULTS.cap_pct),
    king_reserve_pct: z.number().min(0).max(MANA_MARGIN_MAX_PCT).default(MANA_DEFAULTS.king_reserve_pct),
    warn_margin_pct: z.number().min(0).max(MANA_MARGIN_MAX_PCT).default(MANA_DEFAULTS.warn_margin_pct),
    probe_interval_minutes: z.int().min(1).max(MINUTES_PER_DAY).default(MANA_DEFAULTS.probe_interval_minutes),
    reassign_after_hours: z
      .int()
      .min(1)
      .nullable()
      .default(null)
      .meta(
        describe(
          'If set, a quest in paused_mana longer than this may be reassigned to another character by rule. null = never (principle 6 keeps the assignee).',
        ),
      ),
  })
  .meta({
    $comment:
      'Intake threshold per pool = min(cap_pct, 100 - king_reserve_pct). The world never takes new quests at or above it; a warning fires warn_margin_pct points earlier.',
  });

const BreakersSchema = z.strictObject({
  attempt_minutes: z
    .strictObject({
      low: z
        .int()
        .min(1)
        .default(BREAKER_DEFAULTS.attempt_minutes_low)
        .meta(describe('Ranks below high_rank_from.')),
      high: z
        .int()
        .min(1)
        .default(BREAKER_DEFAULTS.attempt_minutes_high)
        .meta(describe('Ranks from high_rank_from up, and territories with an exclusive e2e check.')),
    })
    .prefault({}),
  high_rank_from: RankSchema.default(BREAKER_DEFAULTS.high_rank_from),
  max_attempts: z.int().min(1).default(BREAKER_DEFAULTS.max_attempts),
  mana_multiplier: z
    .number()
    .positive()
    .default(BREAKER_DEFAULTS.mana_multiplier)
    .meta(
      describe(
        "quest.budget.max_tokens = estimate.tokens x mana_multiplier, never below the rank's share of context_budget_tokens x mana_multiplier.",
      ),
    ),
  same_fail_suspend: z.int().min(1).default(BREAKER_DEFAULTS.same_fail_suspend),
  patrol_weekly_pct: z.number().min(0).max(100).default(BREAKER_DEFAULTS.patrol_weekly_pct),
  max_turns: z.int().min(1).default(BREAKER_DEFAULTS.max_turns),
  subagent_max_minutes: z
    .int()
    .min(1)
    .default(BREAKER_DEFAULTS.subagent_max_minutes)
    .meta(
      describe(
        'Measured only (hook SubagentStart/Stop); overrun emits agent.subagent.overrun and counts against the parent quest.',
      ),
    ),
  subagent_max_turns: z
    .int()
    .min(1)
    .default(BREAKER_DEFAULTS.subagent_max_turns)
    .meta(describe('The enforceable apprentice breaker: maxTurns of the `apprentice` agent definition.')),
  context_budget_tokens: z
    .int()
    .min(1)
    .default(BREAKER_DEFAULTS.context_budget_tokens)
    .meta(describe('The Chancellor splits work so one quest fits one context (principle 13).')),
  verifier_tokens_multiplier: z
    .number()
    .min(1)
    .default(BREAKER_DEFAULTS.verifier_tokens_multiplier)
    .meta(
      describe(
        "A judge's session may spend this many times quest.budget.max_tokens before the token breaker stops it: it reads the whole diff and runs the checks again. The assignee's sessions keep quest.budget.max_tokens.",
      ),
    ),
});

/** A job the Steward runs once a day at `at`, the kingdom's local time (`HH:MM`, 24 hours). */
const dailyJob = (enabled: boolean, at: string) =>
  z
    .strictObject({
      enabled: z.boolean().default(enabled),
      at: z
        .string()
        .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
        .default(at),
    })
    .prefault({});

const ScheduleSchema = z
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
    patrol: z
      .strictObject({
        enabled: z.boolean().default(false),
        every: z
          .string()
          .regex(/^P(?:[0-9]+D)?(?:T(?:[0-9]+H)?(?:[0-9]+M)?)?$/)
          .default(SCHEDULE_DEFAULTS.patrol_every)
          .meta(describe('ISO-8601 duration.')),
      })
      .prefault({}),
  })
  .meta({
    $comment:
      'Scheduled jobs run inside the Steward (no cron, Task Scheduler or launchd). The digest (PS-03) and the triage (PS-03b) have a runner and are on by default; chronicle, temple and patrol have none yet, so they default to disabled.',
  });

const DispatchSchema = z.strictObject({
  tick_seconds: z.int().min(1).default(DISPATCH_DEFAULTS.tick_seconds),
  fairness: z.enum(['round_robin_territory']).default('round_robin_territory'),
  verifier_same_family: z
    .enum(['different_model', 'machine_only'])
    .default('different_model')
    .meta(
      describe(
        'When no verifier of another model family is free: different_model requires a different model slug; machine_only lets the Steward issue a machine verdict (never pass with a failing check).',
      ),
    ),
  resume_after_mana: z
    .boolean()
    .default(false)
    .meta(
      describe(
        'Revive with `--resume <session>` instead of a fresh session built from handover.md. Off by default (principle 13, ADR 0017).',
      ),
    ),
  resume_after_answer_minutes: z
    .int()
    .min(1)
    .max(MINUTES_PER_DAY)
    .nullable()
    .default(DISPATCH_DEFAULTS.resume_after_answer_minutes)
    .meta(
      describe(
        "When the owner answers a character's question within this many minutes of blocked.asked_at and the tribe's adapter can resume, the same CLI session goes on (`--resume`); later, or null, a fresh session starts from handover.md with the answer (ADR 0017).",
      ),
    ),
  max_background: z
    .int()
    .min(1)
    .default(DISPATCH_DEFAULTS.max_background)
    .meta(
      describe(
        "How many pieces of machine work the Steward runs outside its tick at once, kingdom-wide: a submitted quest's checks (or its trial in a scratch plot) and a script-tier quest's script. The next waits for a later tick. Cautious until measured.",
      ),
    ),
});

export const KingdomSchema = z
  .strictObject({
    version: z.literal(1),
    name: NameSchema.meta(describe('Kingdom name chosen by the owner; rendered with `.elv-name` (24ch).')),
    created_at: DateTimeSchema,
    tz: z
      .string()
      .regex(/^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)*$/)
      .refine(isTimeZone, { message: 'unknown IANA time zone' })
      .meta(
        describe(
          'IANA time zone of the machine (e.g. Asia/Ho_Chi_Minh). Event files are named by local day; recording tz keeps replays consistent.',
        ),
      ),
    owner: z.strictObject({
      profession: z.enum(['developer', 'ba', 'marketing', 'researcher', 'other']),
      locale: z
        .enum(['vi', 'en'])
        .default('vi')
        .meta(
          describe(
            'Language of everything the owner reads: handover letters, verdict notes, blocked questions, chronicle, bell, UI.',
          ),
        ),
    }),
    paths: z.strictObject({
      treasury: AbsPathSchema.meta(
        describe(
          'Treasury file (secrets), always outside the kingdom, e.g. ~/.elvaria/treasury.json resolved to an absolute path.',
        ),
      ),
    }),
    tribes: z
      .array(TribeSchema)
      .min(1)
      .superRefine(rejectDuplicateIds)
      .meta(
        describe(
          "Tribes (product plan 0.6, tribe contract): one entry per account the owner signs in to on this machine. Adding a tribe = an adapter (built in, or a file adapters/<name>.mjs in the kingdom) + a theme entry (name, mana colour, sprites, crest) + the owner's own login; the core and existing characters do not change. `elvaria init` writes claude (claude_code) and gemini (antigravity). The Steward reads each adapter's capabilities at start and narrows what that tribe may take (implementation-plan §3.14). Ids are unique (zod).",
        ),
      ),
    programs: ProgramsSchema,
    mana: ManaSchema,
    breakers: BreakersSchema,
    schedule: ScheduleSchema,
    dispatch: DispatchSchema,
    delegation: DelegationSchema,
    bell: z.strictObject({
      desktop: z.boolean().default(true),
      web_push: z.boolean().default(false),
      messaging: z
        .null()
        .default(null)
        .meta(describe('Messaging channel, chosen in stage 2; null until then.')),
    }),
    tunnel: z.strictObject({
      enabled: z.boolean().default(false),
      kind: z.enum(['tailscale', 'cloudflare']).optional(),
    }),
    // Required, as in v1: init writes 'fantasy'; the annotation keeps that visible in the contract.
    theme: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/)
      .meta({ default: 'fantasy' }),
    ui: z.strictObject({
      mode: z.enum(['night', 'day']).default('night'),
      eco: z.boolean().default(false),
    }),
  })
  .meta({
    title: 'Kingdom',
    description:
      "kingdom.json at the root of a kingdom directory (one machine, one user, one kingdom). The kingdom directory is chosen with `elvaria init --kingdom <dir>` and lives outside the Elvaria repo. Holds the owner's settings: tribes (one per signed-in account, each run by an adapter), mana cap and king's reserve, circuit breakers, schedules, dispatch policy, bell channels, tunnel, theme and UI mode. `elvaria doctor` fills `tribes[].tool`.",
    $comment: `${GENERATED_NOTE} Paths inside kingdom files are relative to the kingdom directory with '/' separators; the only absolute paths are territory.path and paths.treasury (implementation-plan §2.1). Not expressible here: tz must be a time zone Intl knows.`,
  });

export type Kingdom = z.infer<typeof KingdomSchema>;
