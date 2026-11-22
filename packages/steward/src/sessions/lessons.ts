// The lessons a session loads (PS-12, temple-first plan DB3-DB5, ADR 0027): the Steward reads the character's
// scripture and the temple's, the domain parses them, names each line and chooses by the session's scope, at most 40.
// The Steward hashes the sentence of a line without an id (the domain has no hash), as it does for a memo's id, and
// never writes into the owner's line. `elvaria scripture list` runs the same three steps, so it shows what loads.
import { createHash } from 'node:crypto';
import process from 'node:process';

import { lessonRefOf, parseScripture, selectLessons } from '@elvaria/domain';
import { redact } from '@elvaria/eventlog';
import type {
  Character,
  LessonRef,
  LessonSelection,
  LessonSession,
  LessonVocabulary,
  Quest,
  Role,
  ScriptureLine,
  Territory,
} from '@elvaria/domain';

import type { Scripture } from '../texts/files.ts';

/** A lesson as the Steward knows it: its line, the scripture file it is in (with `/`), and its ref. */
export interface ScriptureLesson extends ScriptureLine {
  readonly file: string;
  readonly ref: LessonRef;
}

/** The hash a line without an id is named by (lessonTextRefOf). */
const digestOf = (key: string): Uint8Array => createHash('sha256').update(key).digest();

/**
 * The line, flagged `secret` when the event log would mask part of its sentence: no secret reaches a prompt (ADR
 * 0013), and the domain, which cannot import the redaction, leaves such a line out like any it cannot read.
 */
function withSecretFlagged(line: ScriptureLine, known: readonly string[]): ScriptureLine {
  if (redact(line.text, known) === line.text) return line;
  return { ...line, flaws: [...line.flaws, { code: 'secret' }] };
}

/** Every lesson of the files, in their order, with its file and ref; `known`, the session's secret values. */
export const lessonsIn = (
  scriptures: readonly Scripture[],
  known: readonly string[] = [],
): ScriptureLesson[] =>
  scriptures.flatMap(({ file, owner, text }) =>
    parseScripture(text, owner).lessons.map((line) => ({
      ...withSecretFlagged(line, known),
      file,
      ref: lessonRefOf(line, digestOf),
    })),
  );

/** The session a scope is matched against; the OS is the Steward's own, as shellOf reads it. */
export const lessonSessionOf = (
  session: {
    readonly role: Role;
    readonly character: Character;
    readonly territory: Territory;
    readonly quest: Quest;
  },
  platform: string = process.platform,
): LessonSession => ({
  role: session.role,
  class: session.character.class,
  tribe: session.character.tribe,
  os: platform,
  territory: session.territory.id,
  tags: session.quest.tags,
});

export const sessionLessonsOf = (
  scriptures: readonly Scripture[],
  session: LessonSession,
  vocabulary: LessonVocabulary,
  known: readonly string[] = [],
): LessonSelection<ScriptureLesson> => selectLessons(lessonsIn(scriptures, known), session, vocabulary);
