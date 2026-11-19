// When the Temple frees a character (PS-12g, temple-first plan DB13 as the owner settled it): one the Steward suspended
// for a fail streak is idle again (`temple_done`, §2.6) once an `add` or a `merge` of the Monk's report put in a line
// with the streak's fail kind that a next session of it would load: its own scripture, or the temple's with a scope that
// matches. Without such a line it stays for the owner: the Monk chose a check, a script, knowledge or a stronger model (a
// letter, no line), the operation was refused, or the line is for others; freed, it would fail the same way again. A
// character the owner suspended is the owner's to release, whatever the report wrote.
import { linesOf } from './ledger.ts';
import { selectLessons } from './select.ts';
import type { CharacterId, LessonId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { ScriptureFile } from './ledger.ts';
import type { ScriptureLine } from './parse.ts';
import type { LessonSession, LessonVocabulary } from './select.ts';

export type ReleaseCandidate = Pick<Character, 'id' | 'class' | 'tribe' | 'status' | 'consecutive_fail'>;

/** What the Steward reads once a temple report is applied. */
export interface TempleRelease {
  /** Every scripture with its ledger, as they are now. */
  readonly files: readonly ScriptureFile[];
  /**
   * The ids of the lines the report's `add` and `merge` operations write (lessonIdOf of the command and the place), the
   * refused ones too: a refused line is in no file. Written on this pass or on one a stopped Steward began.
   */
  readonly added: readonly LessonId[];
  readonly characters: readonly ReleaseCandidate[];
  /** The characters the Steward suspended for a fail streak (streakSuspendedOf of the log). */
  readonly streak: readonly CharacterId[];
  readonly vocabulary: LessonVocabulary;
  /** The OS the Steward runs on, which a scope's `os` is matched against. */
  readonly os: string;
}

/**
 * The sessions it may open next: the one who works (the fail streak is an assignee's), in each territory, on a quest
 * that carries every tag, as worstLoadOf weighs a character for the 40-line cap.
 */
const nextSessionsOf = (character: ReleaseCandidate, input: TempleRelease): LessonSession[] =>
  input.vocabulary.territories.map((territory) => ({
    role: 'assignee',
    class: character.class,
    tribe: character.tribe,
    os: input.os,
    territory,
    tags: input.vocabulary.tags,
  }));

function freed(character: ReleaseCandidate, input: TempleRelease): boolean {
  const kind = character.consecutive_fail.fail_kind;
  if (character.status !== 'suspended' || kind === undefined) return false;
  if (!input.streak.includes(character.id)) return false;
  const lines = input.files
    .filter(({ owner }) => owner === character.id || owner === 'temple')
    .flatMap(linesOf);
  const cures = new Set<ScriptureLine>(
    lines.filter(({ id, fail_kind }) => id !== null && fail_kind === kind && input.added.includes(id)),
  );
  return nextSessionsOf(character, input).some((session) =>
    selectLessons(lines, session, input.vocabulary).loaded.some((line) => cures.has(line)),
  );
}

/** The characters the report frees, in the order given. */
export const templeReleasesOf = (input: TempleRelease): CharacterId[] =>
  input.characters.filter((character) => freed(character, input)).map(({ id }) => id);
