// What waits on the Temple, for the digest (PS-12g, temple-first plan DB10 and DB13 as the owner settled them): the
// characters the Steward suspended for a fail streak and the Temple did not free, each with the Monk's open letters on
// the runs it failed; and the repeated failures that wait while the Temple cannot run, off (`schedule.temple.enabled`,
// off by default since a run spends mana) or with no Monk to run it. The Steward counts the groups as it writes the
// digest: no model, no mana.
import type { CharacterId, MemoId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { FailKind } from '../schema/common.ts';
import type { Memo } from '../schema/memo/memo.ts';
import type { Quest } from '../schema/quest/quest.ts';

/** Why the Temple cannot run: off in kingdom.json, or no character of a class of the Monk that is not suspended. */
export const TEMPLE_BLOCKS = ['disabled', 'no_monk'] as const;
export type TempleBlock = (typeof TEMPLE_BLOCKS)[number];

/** A class of the registry, as far as the Temple reads it. */
interface ClassEntry {
  readonly id: string;
  readonly is_monk?: boolean;
}

const monkClassesOf = (classes: readonly ClassEntry[]): string[] =>
  classes.filter(({ is_monk: monk }) => monk === true).map(({ id }) => id);

export interface TempleWaitingSource {
  /** kingdom.schedule.temple.enabled. */
  readonly enabled: boolean;
  readonly characters: readonly Pick<Character, 'class' | 'status'>[];
  readonly classes: readonly ClassEntry[];
  /** How many repeated failures wait: repeatedFailuresOf over lessonEvidenceOf without a window of days. */
  readonly groups: number;
}

export interface TempleWaiting {
  readonly groups: number;
  /** Both when both hold, in TEMPLE_BLOCKS order. */
  readonly reasons: readonly TempleBlock[];
  /** The registry's first class of the Monk, for the command that adds one (ADR 0016: no class is named here). */
  readonly class: string | null;
}

/**
 * The repeated failures that wait for a Temple that cannot run; none without one, or when the Temple can run. A Monk
 * is a character of a class with `is_monk` that is not suspended, as the Steward reads the writer of a temple report.
 */
export function templeWaitingOf(source: TempleWaitingSource): TempleWaiting | undefined {
  const monks = monkClassesOf(source.classes);
  const ready = source.characters.some(
    (character) => monks.includes(character.class) && character.status !== 'suspended',
  );
  const reasons: TempleBlock[] = [
    ...(source.enabled ? [] : (['disabled'] as const)),
    ...(ready ? [] : (['no_monk'] as const)),
  ];
  if (source.groups === 0 || reasons.length === 0) return undefined;
  return { groups: source.groups, reasons, class: monks[0] ?? null };
}

export interface StreakWaitSource {
  readonly characters: readonly Pick<Character, 'id' | 'class' | 'status' | 'consecutive_fail'>[];
  readonly classes: readonly ClassEntry[];
  /** streakSuspendedOf of the log. */
  readonly streak: readonly CharacterId[];
  readonly memos: readonly Pick<Memo, 'id' | 'from' | 'quest' | 'attempt' | 'state'>[];
  readonly quests: readonly {
    readonly id: Quest['id'];
    readonly attempt_log: readonly Pick<Quest['attempt_log'][number], 'n' | 'character' | 'role'>[];
  }[];
}

/** A character suspended for a fail streak, still: its streak, and the Monk's open letters on runs it worked. */
export interface StreakWait {
  readonly character: CharacterId;
  readonly fail_kind: FailKind | null;
  readonly count: number;
  /** By id. A letter is on a run: its memo names the quest and the attempt, whose assignee was the character. */
  readonly letters: readonly MemoId[];
}

/** The characters suspended for a fail streak and still suspended, by id. */
export function streakWaitsOf(source: StreakWaitSource): StreakWait[] {
  const classes = new Set(monkClassesOf(source.classes));
  const monks = new Set(
    source.characters.filter((character) => classes.has(character.class)).map(({ id }) => id),
  );
  const quests = new Map(source.quests.map((quest) => [quest.id, quest]));
  const lettersTo = (id: CharacterId): MemoId[] =>
    source.memos
      .filter(({ state, from }) => state === 'open' && from !== undefined && monks.has(from))
      .filter(({ quest, attempt }) =>
        (quests.get(quest)?.attempt_log ?? []).some(
          (entry) => entry.n === attempt && entry.role === 'assignee' && entry.character === id,
        ),
      )
      .map((memo) => memo.id)
      .toSorted();
  return source.characters
    .filter(({ id, status }) => status === 'suspended' && source.streak.includes(id))
    .toSorted((a, b) => a.id.localeCompare(b.id))
    .map(({ id, consecutive_fail: streak }) => ({
      character: id,
      fail_kind: streak.fail_kind ?? null,
      count: streak.count,
      letters: lettersTo(id),
    }));
}
