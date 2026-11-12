// `data` of the event types that have a shape in v1 (implementation-plan §2.3, §3.10). Every other type, known or
// not, carries an open object. EVENT_DATA_SCHEMAS is the one source of both the zod check and the contract.
import { z } from 'zod';

import { REGISTRY_ID_PATTERN, TribeIdSchema, UlidSchema } from '../../core/ids.ts';
import { DateTimeSchema, NonEmptyStringSchema } from '../common.ts';
import {
  CharacterChangeDataSchema,
  ManaExhaustedDataSchema,
  ManaPoolDataSchema,
  QuestChangeDataSchema,
  QuestInfirmaryDataSchema,
  QuestUnclaimableDataSchema,
  TerritoryChangeDataSchema,
} from './state-data.ts';
import { GraphBuiltDataSchema, GraphFailedDataSchema } from './graph-data.ts';
import { PlotMergedDataSchema, PlotPatchedDataSchema, PlotRestoredDataSchema } from './plot-data.ts';
import { MemoClosedDataSchema, MemoFiledDataSchema, MemoRoutedDataSchema } from './memo-data.ts';
import {
  UpgradeFailedDataSchema,
  UpgradeRolledBackDataSchema,
  UpgradeStartedDataSchema,
  UpgradeSwitchedDataSchema,
} from './upgrade-data.ts';
import type { EventType } from './event-types.ts';

// Where it always was for the Steward and the specs (P1-21); plot-data.ts holds it since P1-44.
export { PLOT_MERGE_STOPS } from './plot-data.ts';

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
      'Normalised tool kind (implementation-plan §3.10): Read and read_file map to read, Glob/Grep/LS and grep_search/find_by_name/list_dir to search (read before PS-21), Edit/Write and write_file/replace to write, Bash and run_shell_command to bash, WebFetch/WebSearch to web.',
    ),
  );
export type ToolKind = z.infer<typeof ToolKindSchema>;

// Optional and added after v1 shipped with no line written yet, so `v` stays 1 (ADR 0003, implementation-plan §3.12).
const CallerSchema = NonEmptyStringSchema.optional().meta(
  describe(
    'The sub-agent that made the call (`apprentice`), from the hook payload; absent when the character itself did (implementation-plan §3.12).',
  ),
);

const AgentToolDataSchema = z.strictObject({
  tool: ToolKindSchema,
  path: NonEmptyStringSchema.optional().meta(describe("Relative to the plot, '/' separators.")),
  command: z.string().optional().meta(describe('Redacted.')),
  url: z.string().optional(),
  exit: z.int().optional(),
  duration_ms: DurationMsSchema.optional(),
  agent_type: CallerSchema,
});

const AgentToolBlockedDataSchema = z.strictObject({
  tool: ToolKindSchema,
  reason: NonEmptyStringSchema,
  agent_type: CallerSchema,
});

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
  stopped: z
    .literal('max_turns')
    .optional()
    .meta(
      describe(
        'The CLI stopped the sub-agent at its maxTurns (breakers.subagent_max_turns); absent when it finished on its own or the CLI did not say (implementation-plan §3.12).',
      ),
    ),
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
  // Optional and added after v1 (P1-32): every line written before it is a whole pool's, so `v` stays 1.
  model: SnakeIdSchema.optional().meta(
    describe(
      "The one model whose own cap this reads (argon, fable); absent for the whole pool. The pool's HUD band does not follow it (P1-32).",
    ),
  ),
});

const ManaWarningDataSchema = z
  .strictObject({
    ...ManaLevelDataSchema.shape,
    model: SnakeIdSchema.optional().meta(
      describe('The one model whose own cap warns (argon, fable); absent for the whole pool (P1-22).'),
    ),
  })
  .meta(
    describe(
      'A gauge reached warn_margin_pct points below the cap: said once until its window resets or its figure falls back (implementation-plan §3.5, P1-22).',
    ),
  );

const CommandResultDataSchema = z.strictObject({
  command_id: UlidSchema,
  reason: z.string().optional(),
  // Optional and added after v1 (PS-01b): a line written before it, or of a file no command could be read from, has
  // none. A pattern, not the list of kinds, so an older build still reads the line of a kind it does not know.
  kind: SnakeIdSchema.optional().meta(
    describe(
      "The command's `kind` (InboxCommand.kind), so the metrics ledger counts the owner's steps from the log alone; inbox/done/ names it for lines written before PS-01b.",
    ),
  ),
});

// The machine checks of a submitted run run outside the tick (P1-25) for minutes, while the quest sits in review with
// no judge: these two lines tell the owner and the world that they run (P1-10b). The world animates them; it does
// not keep them (reduce.ts), since the checks live in the Steward's memory, not in a file worldStateOf reads.
const CheckStartDataSchema = z
  .strictObject({})
  .meta(
    describe(
      'The checks of the run the envelope\'s `attempt` names started, outside the Steward\'s tick (implementation-plan §3.1 "(P1-25)").',
    ),
  );

export const CHECK_OUTCOMES = ['pass', 'fail', 'error', 'stopped'] as const;
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];

const CheckEndDataSchema = z.strictObject({
  outcome: z
    .enum(CHECK_OUTCOMES)
    .meta(
      describe(
        'pass: every check passed, or none applied; fail: at least one failed; error: they could not run, a later tick runs them again; stopped: killed because the Steward stopped or the quest moved on.',
      ),
    ),
  checks: z
    .array(z.strictObject({ id: SnakeIdSchema, pass: z.boolean(), duration_ms: DurationMsSchema }))
    .meta(
      describe(
        'The checks that ran, in order (verdict.checks without their logs); empty unless pass or fail.',
      ),
    ),
  // Optional and added after v1 (PS-01b, (b) of P1-54): a line written before it, or of checks set aside for no
  // environment, has none, so `v` stays 1.
  environment: z
    .strictObject({
      check: SnakeIdSchema.meta(describe('The first failing check whose log showed its environment failed.')),
      line: NonEmptyStringSchema.meta(
        describe("The line of its log that one of the territory's environment_errors found, masked."),
      ),
    })
    .optional()
    .meta(
      describe(
        "fail only: the Steward set the run's checks aside because their environment failed (P1-54: Docker down, a container gone), so no judge reads them and they run again later. Without it a restarted Steward, the world and the metrics ledger could not tell such a run from a failing one.",
      ),
    ),
});

/**
 * The data schema of each type that has one; `satisfies` keeps every key inside the v1 catalogue. Every type
 * that changes what the world shows has one (state-data.ts), so the world state rebuilds from the log (P0-09).
 */
export const EVENT_DATA_SCHEMAS = {
  'quest.drafted': QuestChangeDataSchema,
  'quest.created': QuestChangeDataSchema,
  'quest.claimed': QuestChangeDataSchema,
  'quest.released': QuestChangeDataSchema,
  'quest.started': QuestChangeDataSchema,
  'quest.submitted': QuestChangeDataSchema,
  'quest.returned': QuestChangeDataSchema,
  'quest.verdict': QuestChangeDataSchema,
  'quest.done': QuestChangeDataSchema,
  'quest.sealed': QuestChangeDataSchema,
  'quest.archived': QuestChangeDataSchema,
  'quest.blocked': QuestChangeDataSchema,
  'quest.unblocked': QuestChangeDataSchema,
  'quest.paused': QuestChangeDataSchema,
  'quest.resumed': QuestChangeDataSchema,
  'quest.infirmary': QuestInfirmaryDataSchema,
  'quest.delivered': QuestChangeDataSchema,
  'quest.edited': QuestChangeDataSchema,
  'quest.unclaimable': QuestUnclaimableDataSchema,
  'agent.tool': AgentToolDataSchema,
  'agent.tool.blocked': AgentToolBlockedDataSchema,
  'agent.session.start': AgentSessionStartDataSchema,
  'agent.session.end': AgentSessionEndDataSchema,
  'agent.subagent.end': AgentSubagentEndDataSchema,
  'agent.subagent.overrun': AgentSubagentOverrunDataSchema,
  'check.start': CheckStartDataSchema,
  'check.end': CheckEndDataSchema,
  'mana.signal': ManaSignalDataSchema,
  'mana.level': ManaLevelDataSchema,
  'mana.warning': ManaWarningDataSchema,
  'mana.exhausted': ManaExhaustedDataSchema,
  'mana.restored': ManaPoolDataSchema,
  'character.created': CharacterChangeDataSchema,
  'character.sleep': CharacterChangeDataSchema,
  'character.wake': CharacterChangeDataSchema,
  'character.meditate': CharacterChangeDataSchema,
  'character.suspend': CharacterChangeDataSchema,
  'character.release': CharacterChangeDataSchema,
  'character.swamp': CharacterChangeDataSchema,
  'character.level_up': CharacterChangeDataSchema,
  'character.level_down': CharacterChangeDataSchema,
  'character.model_changed': CharacterChangeDataSchema,
  'command.applied': CommandResultDataSchema,
  'command.rejected': CommandResultDataSchema,
  'plot.patched': PlotPatchedDataSchema,
  'plot.merged': PlotMergedDataSchema,
  'plot.restored': PlotRestoredDataSchema,
  'territory.attached': TerritoryChangeDataSchema,
  'territory.surveyed': TerritoryChangeDataSchema,
  'territory.health': TerritoryChangeDataSchema,
  'graph.built': GraphBuiltDataSchema,
  'graph.failed': GraphFailedDataSchema,
  'memo.filed': MemoFiledDataSchema,
  'memo.routed': MemoRoutedDataSchema,
  'memo.closed': MemoClosedDataSchema,
  'upgrade.started': UpgradeStartedDataSchema,
  'upgrade.switched': UpgradeSwitchedDataSchema,
  'upgrade.rolled_back': UpgradeRolledBackDataSchema,
  'upgrade.failed': UpgradeFailedDataSchema,
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
