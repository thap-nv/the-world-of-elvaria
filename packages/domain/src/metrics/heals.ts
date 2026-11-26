import { healDueIn, healedIn } from '../breaker/heal.ts';
import { HEALABLE_REASONS } from '../infirmary/reasons.ts';
import { isEventOf } from '../schema/event/event.ts';
import { medianOf } from './session-counts.ts';
import { inWindow } from './window.ts';
import type { MetricsInput } from './ledger.ts';
import type { MetricsWindow } from './window.ts';
import type { CharacterId, TribeId } from '../core/ids.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { Quest } from '../schema/quest/quest.ts';

export interface HealAssignee {
  readonly character: CharacterId | null;
  readonly tribe: TribeId | null;
  readonly heals: number;
}

export interface HealGroup {
  readonly kind: 'pending' | 'self' | 'healer';
  readonly tribe: TribeId | null;
  readonly heals: number;
  readonly healed: number;
  readonly rate: number | null;
  readonly median_tokens: number | null;
}

export interface HealVerdicts {
  readonly decided: number;
  readonly passed: number;
  readonly rate: number | null;
}

export interface Heals {
  readonly total: number;
  readonly by_assignee: readonly HealAssignee[];
  readonly by_healer: readonly HealGroup[];
  readonly verdicts: { readonly healed: HealVerdicts; readonly ordinary: HealVerdicts };
  readonly owner_submits: number;
}

interface HealRun {
  readonly quest: Quest;
  readonly due: Attempt;
  readonly sessions: readonly Attempt[];
  readonly kind: HealGroup['kind'];
  readonly tribe: TribeId | null;
}

const rateOf = (part: number, whole: number): number | null => (whole === 0 ? null : part / whole);

function runsOf(input: MetricsInput, window: MetricsWindow): HealRun[] {
  const tribes = new Map(input.characters?.map(({ id, tribe }) => [id, tribe]));
  return input.quests.flatMap((quest) => {
    const seen = new Set<number>();
    return quest.attempt_log.flatMap((due): HealRun[] => {
      if (due.heal !== 'due' || seen.has(due.n)) return [];
      seen.add(due.n);
      if (!inWindow(window, due.started_at)) return [];
      const sessions = quest.attempt_log.filter((entry) => entry.n === due.n && entry.heal === 'session');
      const last = sessions.at(-1);
      return [
        {
          quest,
          due,
          sessions,
          kind: last === undefined ? 'pending' : last.character === quest.assignee ? 'self' : 'healer',
          tribe:
            last?.character === undefined || last.character === null
              ? null
              : (tribes.get(last.character) ?? null),
        },
      ];
    });
  });
}

function assigneesOf(input: MetricsInput, runs: readonly HealRun[]): HealAssignee[] {
  const tribes = new Map(input.characters?.map(({ id, tribe }) => [id, tribe]));
  const characters = [...new Set(runs.map(({ due }) => due.character))];
  return characters
    .sort((a, b) => (a ?? '').localeCompare(b ?? ''))
    .map((character) => ({
      character,
      tribe: character === null ? null : (tribes.get(character) ?? null),
      heals: runs.filter(({ due }) => due.character === character).length,
    }));
}

function groupsOf(runs: readonly HealRun[]): HealGroup[] {
  const keys = [...new Set(runs.map(({ kind, tribe }) => JSON.stringify([kind, tribe])))].sort();
  return keys.map((key) => {
    const [kind, tribe] = JSON.parse(key) as [HealGroup['kind'], TribeId | null];
    const group = runs.filter((run) => run.kind === kind && run.tribe === tribe);
    const healed = group.filter(({ quest, due }) => healedIn(quest.attempt_log, due.n)).length;
    return {
      kind,
      tribe,
      heals: group.length,
      healed,
      rate: rateOf(healed, group.length),
      median_tokens: medianOf(
        group.flatMap(({ sessions }) =>
          sessions.flatMap(({ tokens }) => (tokens === undefined ? [] : [tokens])),
        ),
      ),
    };
  });
}

function verdictsOf(input: MetricsInput, window: MetricsWindow, heals: boolean): HealVerdicts {
  let decided = 0;
  let passed = 0;
  for (const quest of input.quests) {
    const runs = new Map<number, Attempt>();
    for (const entry of quest.attempt_log)
      if (entry.role === 'assignee' && !runs.has(entry.n)) runs.set(entry.n, entry);
    for (const [n, first] of runs) {
      const due = quest.attempt_log.find((entry) => entry.n === n && entry.heal === 'due');
      if (healDueIn(quest.attempt_log, n) !== heals || !inWindow(window, (due ?? first).started_at)) continue;
      const verdicts = input.verdicts.filter(
        (verdict) => verdict.quest_id === quest.id && verdict.attempt === n && verdict.result !== 'partial',
      );
      if (verdicts.length === 0) continue;
      decided += 1;
      if (!verdicts.some(({ result }) => result === 'fail')) passed += 1;
    }
  }
  return { decided, passed, rate: rateOf(passed, decided) };
}

function ownerSubmitsOf(input: MetricsInput, window: MetricsWindow): number {
  const refused = new Set<string>();
  const commands = new Map(input.commands.map((command) => [command.id, command]));
  let count = 0;
  for (const event of input.events) {
    if (
      isEventOf(event, 'quest.infirmary') &&
      (HEALABLE_REASONS as readonly string[]).includes(event.data.reason.code)
    )
      refused.add(`${event.quest}:${event.attempt ?? event.data.quest.attempts}`);
    if (!isEventOf(event, 'command.applied')) continue;
    const command = commands.get(event.data.command_id);
    if (command?.kind !== 'submit' || command.source === 'chancellor' || !inWindow(window, event.ts))
      continue;
    const quest = input.quests.find(({ id }) => id === command.payload.quest);
    if (quest === undefined) continue;
    const n =
      event.attempt ??
      quest.attempt_log.findLast((entry) => entry.started_at <= event.ts)?.n ??
      quest.attempts;
    if (refused.has(`${quest.id}:${n}`)) count += 1;
  }
  return count;
}

/** HL-06a: one heal per refused run, dated by its due entry, with all its later heal sessions. */
export function healsOf(input: MetricsInput, window: MetricsWindow = {}): Heals {
  const runs = runsOf(input, window);
  return {
    total: runs.length,
    by_assignee: assigneesOf(input, runs),
    by_healer: groupsOf(runs),
    verdicts: { healed: verdictsOf(input, window, true), ordinary: verdictsOf(input, window, false) },
    owner_submits: ownerSubmitsOf(input, window),
  };
}
