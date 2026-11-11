// First-pass rate by class, tag, model and kind (implementation-plan §3.16.1): of the quests whose first run was
// decided, how many passed it.
import { firstPassOf, firstRunOf } from './judgement.ts';
import { inWindow } from './window.ts';
import type { QuestTrail } from './rework.ts';
import type { MetricsWindow } from './window.ts';
import type { Quest } from '../schema/quest/quest.ts';

/** `key` is null for the overall rate, and for a quest with no class or a session with no known model. */
export interface PassRate {
  readonly key: string | null;
  readonly decided: number;
  readonly passed: number;
}

export interface FirstPassRates {
  readonly overall: PassRate;
  readonly by_class: readonly PassRate[];
  readonly by_tag: readonly PassRate[];
  readonly by_model: readonly PassRate[];
  readonly by_kind: readonly PassRate[];
}

interface Decision {
  readonly quest: Quest;
  readonly model: string | null;
  readonly passed: boolean;
}

/** The quests whose first run started in the window and has been decided, with that run's model. */
function decisionsOf(
  trails: readonly QuestTrail[],
  models: ReadonlyMap<string, string>,
  window: MetricsWindow,
): Decision[] {
  return trails.flatMap((trail) => {
    const first = firstRunOf(trail.quest);
    const passed = firstPassOf(trail);
    if (first === undefined || passed === undefined || !inWindow(window, first.started_at)) return [];
    const model = first.session_id === undefined ? undefined : models.get(first.session_id);
    return [{ quest: trail.quest, model: model ?? null, passed }];
  });
}

const rateOf = (key: string | null, decisions: readonly Decision[]): PassRate => ({
  key,
  decided: decisions.length,
  passed: decisions.filter(({ passed }) => passed).length,
});

/** One rate per key, in key order; a decision counts under each of its keys (a quest has several tags). */
function ratesBy(
  decisions: readonly Decision[],
  keysOf: (decision: Decision) => readonly (string | null)[],
): PassRate[] {
  const keys = [...new Set(decisions.flatMap(keysOf))].sort((a, b) => (a ?? '').localeCompare(b ?? ''));
  return keys.map((key) =>
    rateOf(
      key,
      decisions.filter((decision) => keysOf(decision).includes(key)),
    ),
  );
}

export function firstPassRatesOf(
  trails: readonly QuestTrail[],
  models: ReadonlyMap<string, string>,
  window: MetricsWindow,
): FirstPassRates {
  const decisions = decisionsOf(trails, models, window);
  return {
    overall: rateOf(null, decisions),
    by_class: ratesBy(decisions, ({ quest }) => [quest.class_required ?? null]),
    by_tag: ratesBy(decisions, ({ quest }) => quest.tags),
    by_model: ratesBy(decisions, ({ model }) => [model]),
    by_kind: ratesBy(decisions, ({ quest }) => [quest.kind]),
  };
}
