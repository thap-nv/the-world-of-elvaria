// `data` of the event types that have a shape in v1 (implementation-plan §2.3, §3.10). Every other type, known or
// not, carries an open object. EVENT_DATA_SCHEMAS is the one source of both the zod check and the contract.
import { z } from 'zod';

import { REGISTRY_ID_PATTERN, TribeIdSchema, UlidSchema } from '../../core/ids.ts';
import { DateTimeSchema, NonEmptyStringSchema } from '../common.ts';
import type { EventType } from './event-types.ts';

const describe = (description: string) => ({ description });
const SnakeIdSchema = z.string().regex(REGISTRY_ID_PATTERN);
// The pattern of ModelSlugSchema (common.ts) without its `id`: an id would put a `$ref` into the rules below,
// and those rules are converted on their own, where the `$defs` it points to does not exist.
const ModelSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);
const DurationMsSchema = z.int().min(0);

export const TOOL_KINDS = ['read', 'write', 'bash', 'web', 'search', 'other'] as const;
export const ToolKindSchema = z
  .enum(TOOL_KINDS)
  .meta(
    describe(
      'Normalised tool kind (implementation-plan §3.10): Read/Glob/Grep and read_file map to read, Edit/Write and write_file/replace to write, Bash and run_shell_command to bash, WebFetch/WebSearch to web.',
    ),
  );
export type ToolKind = z.infer<typeof ToolKindSchema>;

const AgentToolDataSchema = z.strictObject({
  tool: ToolKindSchema,
  path: NonEmptyStringSchema.optional().meta(describe("Relative to the plot, '/' separators.")),
  command: z.string().optional().meta(describe('Redacted.')),
  url: z.string().optional(),
  exit: z.int().optional(),
  duration_ms: DurationMsSchema.optional(),
});

const AgentToolBlockedDataSchema = z.strictObject({ tool: ToolKindSchema, reason: NonEmptyStringSchema });

const AgentSessionStartDataSchema = z.strictObject({ session: NonEmptyStringSchema, model: ModelSlugSchema });

const AgentSessionEndDataSchema = z.strictObject({
  outcome: z
    .enum(['completed', 'max_turns', 'budget', 'killed', 'error'])
    .meta(describe('RunResult.outcome (implementation-plan §3.7).')),
  usage: z.strictObject({ tokens: z.int().min(0), turns: z.int().min(0).optional() }).optional(),
});

const AgentSubagentEndDataSchema = z.strictObject({
  agent_type: NonEmptyStringSchema,
  duration_ms: DurationMsSchema,
});

const AgentSubagentOverrunDataSchema = z.strictObject({
  agent_type: NonEmptyStringSchema,
  duration_ms: DurationMsSchema,
  limit_minutes: z.int().min(1),
});

const ManaSignalDataSchema = z
  .strictObject({ error: SnakeIdSchema, source: SnakeIdSchema })
  .meta(
    describe("In-band 'out of mana' signal, e.g. error rate_limit from source stop_failure or api_retry."),
  );

const ManaLevelDataSchema = z.strictObject({
  tribe: TribeIdSchema.meta(describe('TribeId from kingdom.tribes[].')),
  pool: SnakeIdSchema.meta(
    describe(
      "PoolId from poolOf(tribe, model): the tribe id for a single-pool account (claude), or the adapter's pool (antigravity: gemini_models, claude_gpt_models).",
    ),
  ),
  window: z.enum(['five_hour', 'weekly']),
  used_pct: z.number().min(0).max(100),
  resets_at: DateTimeSchema.optional(),
  source: z.enum(['rate_limits', 'estimate', 'signal']),
});

const CommandResultDataSchema = z.strictObject({ command_id: UlidSchema, reason: z.string().optional() });

const QuestInfirmaryDataSchema = z.strictObject({
  reason: NonEmptyStringSchema.meta(
    describe('e.g. breaker:time, breaker:tokens, max_attempts, script_error.'),
  ),
});

/** The data schema of each type that has one; `satisfies` keeps every key inside the v1 catalogue. */
export const EVENT_DATA_SCHEMAS = {
  'agent.tool': AgentToolDataSchema,
  'agent.tool.blocked': AgentToolBlockedDataSchema,
  'agent.session.start': AgentSessionStartDataSchema,
  'agent.session.end': AgentSessionEndDataSchema,
  'agent.subagent.end': AgentSubagentEndDataSchema,
  'agent.subagent.overrun': AgentSubagentOverrunDataSchema,
  'mana.signal': ManaSignalDataSchema,
  'mana.level': ManaLevelDataSchema,
  'command.applied': CommandResultDataSchema,
  'command.rejected': CommandResultDataSchema,
  'quest.infirmary': QuestInfirmaryDataSchema,
} as const satisfies Partial<Record<EventType, z.ZodType>>;

export type TypedEventType = keyof typeof EVENT_DATA_SCHEMAS;
export type EventData<T extends TypedEventType> = z.infer<(typeof EVENT_DATA_SCHEMAS)[T]>;

export const hasDataSchema = (type: string): type is TypedEventType =>
  Object.hasOwn(EVENT_DATA_SCHEMAS, type);

type JsonObject = Record<string, unknown>;

const jsonOf = (schema: z.ZodType): JsonObject => {
  const { $schema: _dialect, ...body } = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' });
  return body;
};

/**
 * The contract's `allOf`: one `if type … then data …` per data schema, as v1 writes it, built from the zod
 * schemas above so the JSON cannot drift from the check. Types sharing one schema share one rule.
 */
export function dataRules(): JsonObject[] {
  const typesBySchema = new Map<z.ZodType, string[]>();
  for (const [type, schema] of Object.entries(EVENT_DATA_SCHEMAS)) {
    typesBySchema.set(schema, [...(typesBySchema.get(schema) ?? []), type]);
  }
  return [...typesBySchema].map(([schema, types]) => ({
    if: { properties: { type: types.length === 1 ? { const: types[0] } : { enum: types } } },
    then: { properties: { data: jsonOf(schema) } },
  }));
}
