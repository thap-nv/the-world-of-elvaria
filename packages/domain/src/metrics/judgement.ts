// Per quest: did its first run pass, which passes did the owner overturn, and what did a sealed quest cost
// (implementation-plan §3.16.1, ADR 0027).
import { MS_PER_MINUTE } from '../constants.ts';
import { isCounted } from './rework.ts';
import type { QuestTrail } from './rework.ts';
import type { QuestId } from '../core/ids.ts';
import type { FailKind } from '../schema/common.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { Quest } from '../schema/quest/quest.ts';

/**
 * Whether the quest's first run passed: its judgement (the judge's, the machine's or the owner's) holds a pass and
 * no fail. A first run that ended without one, followed by another run, did not pass (a breaker, a crash);
 * `undefined` while undecided, and for a quest no character worked (a script).
 */
export function firstPassOf(trail: QuestTrail): boolean | undefined {
  const runs = trail.quest.attempt_log.filter((entry) => isCounted(entry) && entry.role === 'assignee');
  const first = runs[0];
  if (first === undefined) return undefined;
  const judged = trail.verdicts.filter(({ attempt, result }) => attempt === first.n && result !== 'partial');
  if (judged.some(({ result }) => result === 'fail')) return false;
  if (judged.some(({ result }) => result === 'pass')) return true;
  return runs.some(({ n }) => n > first.n) ? false : undefined;
}

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
