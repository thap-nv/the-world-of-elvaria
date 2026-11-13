// The metrics ledger, read side (implementation-plan §3.16.1, ADR 0027): a pure function of the quests, their
// verdicts, the event log and the handled inbox commands. `elvaria metrics` prints it and docs/metrics-report.md
// renders it; nothing here writes, so a kingdom is measured without a Steward and without mana.
import { REWORK_CAUSES, OWNER_COMMAND_KINDS } from './causes.ts';
import { escapedOf, firstPassOf, firstRunOf, sealedCostOf } from './judgement.ts';
import { ownerCommandsOf, sequelsIn, sessionModelsOf, trailsOf } from './ledger.ts';
import { memoCountsOf, outOfScopeOf, readsOf, setAsidesOf } from './log-counts.ts';
import { firstPassRatesOf } from './rates.ts';
import { reworkOf } from './rework.ts';
import { firstEditsOf, graphQueriesOf, promptSizesOf } from './session-counts.ts';
import { inWindow } from './window.ts';
import type { OwnerCommandKind, ReworkCause } from './causes.ts';
import type { EscapedDefect, SealedCost } from './judgement.ts';
import type { MetricsInput, OwnerCommand } from './ledger.ts';
import type { MemoCounts, OutOfScope, Reads, SetAside } from './log-counts.ts';
import type { FirstPassRates } from './rates.ts';
import type { QuestTrail, Rework } from './rework.ts';
import type { FirstEdits, GraphQueries, PromptSizes } from './session-counts.ts';
import type { MetricsWindow } from './window.ts';
import type { ClassId, KindId, QuestId } from '../core/ids.ts';
import type { QuestStatus, Tier } from '../schema/quest/shared.ts';

/** The attempt-log entries that started in the window. */
export interface RunCounts {
  readonly entries: number;
  /** Of them, a character's sessions, the mana's pauses included. */
  readonly sessions: number;
  /** Of them, the machine's runs (a script, a party's machine merge): no character. */
  readonly machine: number;
  /** Sessions the mana stopped; the same attempt went on in the next one, which is no redo. */
  readonly paused: number;
  /** Sessions that followed the first inside one entry (P1-49), from the event log. */
  readonly sequels: number;
}

export interface QuestMetrics {
  readonly id: QuestId;
  readonly kind: KindId;
  readonly tier: Tier;
  readonly class: ClassId | null;
  readonly status: QuestStatus;
  /** Attempt-log entries in the window, and their tokens. */
  readonly entries: number;
  readonly tokens: number;
  readonly rework: Readonly<Record<ReworkCause, number>>;
  /** null while the first run is undecided, or when it lies outside the window. */
  readonly first_pass: boolean | null;
  readonly owner_commands: number;
}

export interface CommandCount {
  readonly kind: OwnerCommandKind;
  readonly count: number;
}

export interface Metrics {
  readonly window: MetricsWindow;
  readonly runs: RunCounts;
  /** Every rework session that started in the window, with its cause. */
  readonly rework: readonly Rework[];
  readonly first_pass: FirstPassRates;
  /** Owner returns inside the window of a run a judge or the machine had passed. */
  readonly escaped: readonly EscapedDefect[];
  /** Quests sealed inside the window, with what they cost. */
  readonly sealed: readonly SealedCost[];
  /** The owner's applied commands on quests inside the window, per kind of OWNER_COMMAND_KINDS. */
  readonly owner_commands: readonly CommandCount[];
  /** The quests worked, or stepped into by the owner, inside the window, by id. */
  readonly quests: readonly QuestMetrics[];
  /** Runs of checks set aside because their environment failed (P1-54), from `check.end` (PS-01b). */
  readonly set_aside: readonly SetAside[];
  /** The sessions' reads by file (PS-01b). */
  readonly reads: Reads;
  /** The code graph's queries, next to the reads (PS-21). */
  readonly graph: GraphQueries;
  /** Each assignee session's tool calls before its first edit (PS-21). */
  readonly first_edits: FirstEdits;
  /** Prompt size by block and role, from the load traces (PS-21). */
  readonly prompts: PromptSizes;
  /** Submits that changed files outside their quest's scope (PS-05): a signal for the judge, never a fail. */
  readonly out_of_scope: readonly OutOfScope[];
  /** The memos filed, and who decided them: the owner, or the Chancellor's triage (PS-03b). */
  readonly memos: MemoCounts;
}

function runCountsOf(trails: readonly QuestTrail[], input: MetricsInput, window: MetricsWindow): RunCounts {
  const entries = trails.flatMap(({ quest }) =>
    quest.attempt_log.filter(({ started_at }) => inWindow(window, started_at)),
  );
  const machine = entries.filter(({ character }) => character === null).length;
  return {
    entries: entries.length,
    sessions: entries.length - machine,
    machine,
    paused: entries.filter(({ character, outcome }) => character !== null && outcome === 'paused').length,
    sequels: sequelsIn(input.events, window),
  };
}

const byCause = (rework: readonly Rework[]): Record<ReworkCause, number> =>
  Object.fromEntries(
    REWORK_CAUSES.map((cause) => [cause, rework.filter((entry) => entry.cause === cause).length]),
  ) as Record<ReworkCause, number>;

function questRow(
  trail: QuestTrail,
  rework: readonly Rework[],
  commands: readonly OwnerCommand[],
  window: MetricsWindow,
): QuestMetrics {
  const { quest } = trail;
  const entries = quest.attempt_log.filter(({ started_at }) => inWindow(window, started_at));
  const first = firstRunOf(quest);
  const decided = first !== undefined && inWindow(window, first.started_at) ? firstPassOf(trail) : undefined;
  return {
    id: quest.id,
    kind: quest.kind,
    tier: quest.tier,
    class: quest.class_required ?? null,
    status: quest.status,
    entries: entries.length,
    tokens: entries.reduce((total, { tokens }) => total + (tokens ?? 0), 0),
    rework: byCause(rework.filter((entry) => entry.quest === quest.id)),
    first_pass: decided ?? null,
    owner_commands: commands.filter((command) => command.quest === quest.id).length,
  };
}

/** The ledger over the window; with no window, over the whole kingdom. */
export function metricsOf(input: MetricsInput, window: MetricsWindow = {}): Metrics {
  const trails = trailsOf(input);
  const rework = trails.flatMap(reworkOf).filter(({ started_at }) => inWindow(window, started_at));
  const commands = ownerCommandsOf(input, window);
  const worked = trails.filter(
    ({ quest }) =>
      quest.attempt_log.some(({ started_at }) => inWindow(window, started_at)) ||
      commands.some((command) => command.quest === quest.id),
  );
  return {
    window,
    runs: runCountsOf(trails, input, window),
    rework,
    first_pass: firstPassRatesOf(trails, sessionModelsOf(input.events), window),
    escaped: trails.flatMap(escapedOf).filter(({ at }) => inWindow(window, at)),
    sealed: trails
      .flatMap(({ quest }) => sealedCostOf(quest) ?? [])
      .filter(({ sealed_at }) => inWindow(window, sealed_at)),
    owner_commands: OWNER_COMMAND_KINDS.map((kind) => ({
      kind,
      count: commands.filter((command) => command.kind === kind).length,
    })),
    quests: worked
      .map((trail) => questRow(trail, rework, commands, window))
      .sort((a, b) => a.id.localeCompare(b.id)),
    set_aside: setAsidesOf(input.events, window),
    reads: readsOf(input.events, window),
    graph: graphQueriesOf(input.events, window),
    first_edits: firstEditsOf(input.events, input.quests, window),
    prompts: promptSizesOf(input.events, input.quests, window),
    out_of_scope: outOfScopeOf(input.events, window),
    memos: memoCountsOf(input.events, window),
  };
}
