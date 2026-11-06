// One tribe of kingdom.json: an adapter, the owner's own account, and how much it may run (ADR 0021).
import { z } from 'zod';

import { REGISTRY_ID_PATTERN, TribeIdSchema } from '../core/ids.ts';
import { AbsPathSchema, DateTimeSchema, ModelSlugSchema, NonEmptyStringSchema } from './common.ts';

const TribeToolSchema = z
  .strictObject({
    path: AbsPathSchema,
    version: NonEmptyStringSchema,
    default_model: ModelSlugSchema.optional(),
    auth: z.enum(['login', 'api_key']).default('login').meta({
      description:
        "login = the owner's own sign-in saved by the unmodified CLI (claude.ai, Google, ChatGPT); api_key = a key from the treasury (paid, so budget.usd_week is required; mandatory for Claude if Elvaria is shared with other people).",
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
      .regex(/^(?:[a-z][a-z0-9_]*|adapters\/[a-z0-9][a-z0-9-]*\.mjs)$/)
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
        usd_week: z.number().positive().optional().meta({
          description:
            'Weekly spend ceiling; required when tool.auth = api_key (a paid key has no hard cap of its own).',
        }),
      })
      .optional()
      .meta({ description: 'Denominator for the `estimate` gauge source (implementation-plan §3.5).' }),
  })
  .superRefine((tribe, ctx) => {
    if (tribe.adapter === 'gemini_cli' && tribe.tool !== undefined && tribe.tool.auth !== 'api_key') {
      ctx.addIssue({
        code: 'custom',
        path: ['tool', 'auth'],
        message: 'adapter gemini_cli needs auth = api_key',
      });
    }
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
    // The same two rules as the superRefine above, for readers of the JSON contract.
    allOf: [
      {
        $comment: 'Gemini CLI no longer serves consumer accounts: it runs only with a paid API key.',
        if: { properties: { adapter: { const: 'gemini_cli' } } },
        then: { properties: { tool: { required: ['auth'], ...API_KEY } } },
      },
      {
        if: { required: ['tool'], properties: { tool: { required: ['auth'], ...API_KEY } } },
        then: { required: ['budget'], properties: { budget: { required: ['usd_week'] } } },
      },
    ],
  });

export type Tribe = z.infer<typeof TribeSchema>;
