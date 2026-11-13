// Per quest: did its first run pass, which passes did the owner overturn, and what did a sealed quest cost
// (implementation-plan §3.16.1, ADR 0027).
import { MS_PER_MINUTE } from '../constants.ts';
import { isCounted } from './rework.ts';
import type { QuestTrail } from './rework.ts';
import type { QuestId } from '../core/ids.ts';
import type { FailKind } from '../schema/common.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { Quest } from '../schema/quest/quest.ts';

/** One run of the quest's assignee, as the ledger judges it. */
export interface RunJudgement {
  readonly n: number;
  /** Its first counted session's start. */
  readonly started_at: string;
  /** undefined while undecided. */
  readonly passed: boolean | undefined;
}

/**
 * Whether each run of the assignee passed, in order: its judgement (the judge's, the machine's or the owner's) holds a
 * pass and no fail. A run that ended without one, followed by another run, did not pass (a breaker, a crash);
 * `undefined` while undecided. None for a quest no character worked (a script). (PS-06b) The rate by run reads them
 * all; the first-pass rate reads the first.
 */
export function runJudgementsOf(trail: QuestTrail): RunJudgement[] {
  const runs: Attempt[] = [];
  for (const entry of trail.quest.attempt_log)
    if (isCounted(entry) && entry.role === 'assignee' && !runs.some(({ n }) => n === entry.n))
      runs.push(entry);
  return runs.map(({ n, started_at }) => {
    const judged = trail.verdicts.filter(({ attempt, result }) => attempt === n && result !== 'partial');
    const later = runs.some((run) => run.n > n);
    if (judged.some(({ result }) => result === 'fail')) return { n, started_at, passed: false };
    if (judged.some(({ result }) => result === 'pass')) return { n, started_at, passed: true };
    return { n, started_at, passed: later ? false : undefined };
  });
}

/** Whether the quest's first run passed (runJudgementsOf); `undefined` while undecided, and for a script. */
export const firstPassOf = (trail: QuestTrail): boolean | undefined => runJudgementsOf(trail)[0]?.passed;

/** The first counted assignee session: whose model the first-pass rate is grouped by. */
export const firstRunOf = (quest: Quest): Attempt | undefined =>
  quest.attempt_log.find((entry) => isCounted(entry) && entry.role === 'assignee');

/** An escaped defect: the owner returned a run that a judge or the machine had passed. */
export interface EscapedDefect {
  readonly quest: QuestId;
  readonly n: number;
  readonly at: string;
  readonly fail_kind: FailKind | null;
  /** The owner said the judge erred, not the assignee (`elvaria return --rejudge`, P1-40). */
  readonly rejudge: boolean;
}

export function escapedOf(trail: QuestTrail): EscapedDefect[] {
  const passed = (n: number): boolean =>
    trail.verdicts.some(({ attempt, by_human, result }) => attempt === n && !by_human && result === 'pass');
  return trail.verdicts
    .filter(({ attempt, by_human, result }) => by_human && result === 'fail' && passed(attempt))
    .map((verdict) => ({
      quest: verdict.quest_id,
      n: verdict.attempt,
      at: verdict.created_at,
      fail_kind: verdict.fail_kind ?? null,
      rejudge: verdict.rejudge === true,
    }));
}

/** What a sealed quest cost: every session's tokens, and its time from the first start to the last end. */
export interface SealedCost {
  readonly quest: QuestId;
  readonly sealed_at: string;
  readonly tokens: number;
  /** First session's start to last session's end, sleeps and waits included. */
  readonly span_minutes: number;
  /** The sessions' own time added up. */
  readonly session_minutes: number;
}

export function sealedCostOf(quest: Quest): SealedCost | undefined {
  if (quest.seal === undefined) return undefined;
  const ended = quest.attempt_log.flatMap(({ started_at, ended_at }) =>
    ended_at === undefined ? [] : [{ from: Date.parse(started_at), to: Date.parse(ended_at) }],
  );
  const span =
    ended.length === 0
      ? 0
      : Math.max(...ended.map(({ to }) => to)) - Math.min(...ended.map(({ from }) => from));
  return {
    quest: quest.id,
    sealed_at: quest.seal.at,
    tokens: quest.attempt_log.reduce((total, { tokens }) => total + (tokens ?? 0), 0),
    span_minutes: span / MS_PER_MINUTE,
    session_minutes: ended.reduce((total, { from, to }) => total + to - from, 0) / MS_PER_MINUTE,
  };
}
