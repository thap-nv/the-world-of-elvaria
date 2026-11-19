// How a load trace and the ledger name a lesson (PS-12, temple-first plan DB5, lesson-sharing S7): its id when the line
// has one; else `T_` and ten base32 digits of a hash of its normalized sentence. The Steward hashes, as it does for a
// memo's id (memoKeyOf, memoIdOf): the domain has no hash function, so the caller passes `digestOf`. The owner who
// edits the sentence of a line without an id makes a new lesson, and its counts start again.
import { crockfordDigits } from '../core/id-source.ts';
import { normalizedMemoText } from '../memo/memo.ts';
import { LESSON_TEXT_REF_CHARS } from './constants.ts';
import type { LessonRef } from '../core/ids.ts';
import type { ScriptureLine } from './parse.ts';

/** What is hashed for the ref of a line without an id: its sentence as a memo's text is read (one form, one case). */
export const lessonTextKeyOf = (text: string): string => normalizedMemoText(text);

/** `T_<10 base32 of digest>`, LESSON_TEXT_REF_PATTERN. */
export const lessonTextRefOf = (digest: Uint8Array): LessonRef =>
  `T_${crockfordDigits(digest, LESSON_TEXT_REF_CHARS)}` as LessonRef;

/** The ref of a line: its id, or the ref of its sentence; `digestOf` is called only for a line without an id. */
export const lessonRefOf = (
  line: Pick<ScriptureLine, 'id' | 'text'>,
  digestOf: (key: string) => Uint8Array,
): LessonRef =>
  // LESSON_REF_PATTERN accepts every LessonId.
  line.id === null ? lessonTextRefOf(digestOf(lessonTextKeyOf(line.text))) : (line.id as string as LessonRef);
