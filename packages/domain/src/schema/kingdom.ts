// kingdom.json v1: the owner's settings for one kingdom (docs/schemas/kingdom.schema.json, implementation-plan §2.3).
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
import { REGISTRY_ID_PATTERN, TribeIdSchema } from '../core/ids.ts';
import {
  AbsPathSchema,
  DateTimeSchema,
  ModelSlugSchema,
  NameSchema,
  NonEmptyStringSchema,
  RankSchema,
  rejectDuplicateIds,
} from './common.ts';

/** A built-in adapter (claude_code, antigravity, gemini_cli, codex_cli) or a kingdom file adapters/<name>.mjs. */
const ADAPTER_PATTERN = /^(?:[a-z][a-z0-9_]*|adapters\/[a-z0-9][a-z0-9-]*\.mjs)$/;

const TribeToolSchema = z.strictObject({
  path: AbsPathSchema,
  version: NonEmptyStringSchema,
  default_model: ModelSlugSchema.optional(),
  auth: z.enum(['login', 'api_key']).default('login'),
  terms_acknowledged_at: DateTimeSchema.optional(),
});

export const TribeSchema = z
  .strictObject({
    id: TribeIdSchema,
    adapter: z.string().regex(ADAPTER_PATTERN),
    enabled: z.boolean().default(true),
    max_concurrent: z.int().min(1).default(1),
    tool: TribeToolSchema.optional(),
    pools: z
      .record(z.string().regex(REGISTRY_ID_PATTERN), z.strictObject({ enabled: z.boolean() }))
      .optional(),
    budget: z
      .strictObject({
        tokens_5h: z.int().min(1).optional(),
        tokens_7d: z.int().min(1).optional(),
        usd_week: z.number().positive().optional(),
      })
      .optional(),
  })
  .superRefine((tribe, ctx) => {
    // The v1 contract's two conditionals (kingdom.schema.json, $defs.tribe.allOf).
    // Gemini CLI no longer serves consumer accounts: it runs only with a paid API key (ADR 0018).
    if (tribe.adapter === 'gemini_cli' && tribe.tool !== undefined && tribe.tool.auth !== 'api_key') {
      ctx.addIssue({
        code: 'custom',
        path: ['tool', 'auth'],
        message: 'adapter gemini_cli needs auth = api_key',
      });
    }
    // A paid key has no hard cap of its own, so the weekly spend ceiling is the only one.
    if (tribe.tool?.auth === 'api_key' && tribe.budget?.usd_week === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['budget', 'usd_week'],
        message: 'auth = api_key needs budget.usd_week',
      });
    }
  });

/** Intake threshold per pool = min(cap_pct, 100 - king_reserve_pct) (implementation-plan §3.5). */
const ManaSchema = z.strictObject({
  cap_pct: z.number().min(1).max(100).default(MANA_DEFAULTS.cap_pct),
  king_reserve_pct: z.number().min(0).max(MANA_MARGIN_MAX_PCT).default(MANA_DEFAULTS.king_reserve_pct),
  warn_margin_pct: z.number().min(0).max(MANA_MARGIN_MAX_PCT).default(MANA_DEFAULTS.warn_margin_pct),
  probe_interval_minutes: z.int().min(1).max(MINUTES_PER_DAY).default(MANA_DEFAULTS.probe_interval_minutes),
  // null = never: principle 6 keeps the assignee of a quest paused for mana.
  reassign_after_hours: z.int().min(1).nullable().default(null),
});

const BreakersSchema = z.strictObject({
  attempt_minutes: z
    .strictObject({
      low: z.int().min(1).default(BREAKER_DEFAULTS.attempt_minutes_low),
      high: z.int().min(1).default(BREAKER_DEFAULTS.attempt_minutes_high),
    })
    .prefault({}),
  high_rank_from: RankSchema.default(BREAKER_DEFAULTS.high_rank_from),
  max_attempts: z.int().min(1).default(BREAKER_DEFAULTS.max_attempts),
  mana_multiplier: z.number().positive().default(BREAKER_DEFAULTS.mana_multiplier),
  same_fail_suspend: z.int().min(1).default(BREAKER_DEFAULTS.same_fail_suspend),
  patrol_weekly_pct: z.number().min(0).max(100).default(BREAKER_DEFAULTS.patrol_weekly_pct),
  max_turns: z.int().min(1).default(BREAKER_DEFAULTS.max_turns),
  subagent_max_minutes: z.int().min(1).default(BREAKER_DEFAULTS.subagent_max_minutes),
  subagent_max_turns: z.int().min(1).default(BREAKER_DEFAULTS.subagent_max_turns),
  context_budget_tokens: z.int().min(1).default(BREAKER_DEFAULTS.context_budget_tokens),
});

// Jobs run inside the Steward (no cron or Task Scheduler); none exists in stage 1, so all default to off.
const ScheduleSchema = z.strictObject({
  chronicle: z
    .strictObject({
      enabled: z.boolean().default(false),
      at: z
        .string()
        .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
        .default(SCHEDULE_DEFAULTS.chronicle_at),
    })
    .prefault({}),
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
      // ISO 8601 duration in days, hours and minutes.
      every: z
        .string()
        .regex(/^P(?:[0-9]+D)?(?:T(?:[0-9]+H)?(?:[0-9]+M)?)?$/)
        .default(SCHEDULE_DEFAULTS.patrol_every),
    })
    .prefault({}),
});

const DispatchSchema = z.strictObject({
  tick_seconds: z.int().min(1).default(DISPATCH_DEFAULTS.tick_seconds),
  fairness: z.enum(['round_robin_territory']).default('round_robin_territory'),
  verifier_same_family: z.enum(['different_model', 'machine_only']).default('different_model'),
  // Off by default: revival is a fresh session from handover.md (principle 13, ADR 0017).
  resume_after_mana: z.boolean().default(false),
});

export const KingdomSchema = z.strictObject({
  version: z.literal(1),
  name: NameSchema,
  created_at: DateTimeSchema,
  // Event files are named by local day, so a typo here would scatter one day over two files.
  tz: z
    .string()
    .regex(/^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)*$/)
    .refine(isTimeZone, { message: 'unknown IANA time zone' }),
  owner: z.strictObject({
    profession: z.enum(['developer', 'ba', 'marketing', 'researcher', 'other']),
    locale: z.enum(['vi', 'en']).default('vi'),
  }),
  paths: z.strictObject({ treasury: AbsPathSchema }),
  tribes: z.array(TribeSchema).min(1).superRefine(rejectDuplicateIds),
  mana: ManaSchema,
  breakers: BreakersSchema,
  schedule: ScheduleSchema,
  dispatch: DispatchSchema,
  bell: z.strictObject({
    desktop: z.boolean().default(true),
    web_push: z.boolean().default(false),
    // Chosen in stage 2; null until then.
    messaging: z.null().default(null),
  }),
  tunnel: z.strictObject({
    enabled: z.boolean().default(false),
    kind: z.enum(['tailscale', 'cloudflare']).optional(),
  }),
  theme: z.string().regex(/^[a-z][a-z0-9-]*$/),
  ui: z.strictObject({
    mode: z.enum(['night', 'day']).default('night'),
    eco: z.boolean().default(false),
  }),
});

export type Tribe = z.infer<typeof TribeSchema>;
export type Kingdom = z.infer<typeof KingdomSchema>;
