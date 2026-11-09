// One tribe of kingdom.json: an adapter, the owner's own account, and how much it may run (ADR 0021).
import { z } from 'zod';

import { REGISTRY_ID_PATTERN, TribeIdSchema } from '../core/ids.ts';
import { AbsPathSchema, DateTimeSchema, ModelSlugSchema, NonEmptyStringSchema } from './common.ts';

/** A built-in adapter: a package of this repo (`claude_code`, `antigravity`, `gemini_cli`, `codex_cli`). */
const BUILT_IN_ADAPTER = '[a-z][a-z0-9_]*';
const ADAPTER_FILE = String.raw`adapters/[a-z0-9][a-z0-9-]*\.mjs`;
/** An owner adapter file inside the kingdom (ADR 0021): only `apps/cli` loads it, with `import()`. */
export const ADAPTER_FILE_PATTERN = new RegExp(`^${ADAPTER_FILE}$`);

/** How a tribe's CLI signs in; which ones an adapter runs with is a capability it declares (§3.14). */
export const TRIBE_AUTHS = ['login', 'api_key'] as const;
export type TribeAuth = (typeof TRIBE_AUTHS)[number];

const TribeToolSchema = z
  .strictObject({
    path: AbsPathSchema,
    version: NonEmptyStringSchema,
    default_model: ModelSlugSchema.optional(),
    auth: z.enum(TRIBE_AUTHS).default('login').meta({
      description:
        "login = the owner's own sign-in saved by the unmodified CLI (claude.ai, Google, ChatGPT); api_key = a key from the treasury (paid, so budget.usd_week is required; mandatory for Claude if Elvaria is shared with other people). It must be one the adapter declares in capabilities.auth (Gemini CLI: api_key only); `elvaria doctor` and `elvaria tribe check` check that, not this schema, which names no adapter (ADR 0021).",
    }),
    terms_acknowledged_at: DateTimeSchema.optional().meta({
      description:
        "When the owner acknowledged the provider's terms for wrapping its CLI (Antigravity: not supported on consumer plans, ADR 0018).",
    }),
  })
  .meta({
    description:
      'The CLI binary, filled and pinned by `elvaria doctor`. Doctor warns when the installed version differs and refuses adapter = antigravity without terms_acknowledged_at.',
  });

const API_KEY = { properties: { auth: { const: 'api_key' } } };

export const TribeSchema = z
  .strictObject({
    id: TribeIdSchema.meta({
      description:
        'TribeId, referenced by character.tribe and class.default_tribe. Display name, mana colour and crest are theme data keyed by this id.',
    }),
    adapter: z
      .string()
      .regex(new RegExp(`^(?:${BUILT_IN_ADAPTER}|${ADAPTER_FILE})$`))
      .meta({
        description:
          'A built-in adapter (claude_code, antigravity, gemini_cli, codex_cli) or an adapter file adapters/<name>.mjs inside the kingdom that exports createAdapter(kit) and passes the conformance suite.',
      }),
    // Required although `elvaria init` writes these defaults: the v1 contract keeps them explicit in the file.
    enabled: z.boolean().meta({ default: true }),
    max_concurrent: z.int().min(1).meta({ default: 1 }),
    tool: TribeToolSchema.optional(),
    pools: z
      .record(z.string().regex(REGISTRY_ID_PATTERN), z.strictObject({ enabled: z.boolean() }))
      .optional()
      .meta({
        description:
          'Adapters with several mana pools in one account (antigravity: gemini_models on, claude_gpt_models off by default so the Gemini tribe really is the Gemini model family). Tribe state is computed per pool.',
      }),
    budget: z
      .strictObject({
        tokens_5h: z.int().min(1).optional(),
        tokens_7d: z.int().min(1).optional(),
        minutes_5h: z.int().min(1).optional().meta({
          description:
            'Session minutes in five hours: the denominator for a tribe whose adapter reports no usage (mana_source elapsed_time, implementation-plan §3.14).',
        }),
        minutes_7d: z.int().min(1).optional().meta({
          description: 'Session minutes in seven days, as minutes_5h.',
        }),
        usd_week: z.number().positive().optional().meta({
          description:
            'Weekly spend ceiling; required when tool.auth = api_key (a paid key has no hard cap of its own).',
        }),
      })
      .optional()
      .meta({
        description:
          'Denominator for the `estimate` gauge source (implementation-plan §3.5): tokens of the sessions in each window, or their minutes for a tribe without usage; used for a pool and window the account reports no figure for. Each pool of the tribe is measured against it.',
      }),
  })
  // Only rules that hold whatever the adapter: which sign-ins an adapter runs with is its own declaration, checked
  // by checkTribeAuth (tribe/auth.ts), so the core never asks which CLI a tribe runs (ADR 0021; P1-19).
  .superRefine((tribe, ctx) => {
    if (tribe.tool?.auth === 'api_key' && tribe.budget?.usd_week === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['budget', 'usd_week'],
        message: 'auth = api_key needs budget.usd_week',
      });
    }
  })
  .meta({
    id: 'tribe',
    // The same rule as the superRefine above, for readers of the JSON contract.
    allOf: [
      {
        if: { required: ['tool'], properties: { tool: { required: ['auth'], ...API_KEY } } },
        then: { required: ['budget'], properties: { budget: { required: ['usd_week'] } } },
      },
    ],
  });

export type Tribe = z.infer<typeof TribeSchema>;
