// Which lessons a session loads (PS-12, temple-first plan DB3, DB4): the lines whose every scope key matches the
// session, the character's scripture first, then the temple's, at most SCRIPTURE_LINES_MAX of them. A line whose scope
// the machine cannot read, or that hides a character, never loads: "out of scope, not loaded" must hold even when the
// scope is written wrong. The Steward decides nothing here; it reads the files and passes the session.
import { ROLES } from '../schema/common.ts';
import { LESSON_SCOPE_KEYS } from '../schema/lesson/scope.ts';
import { SCRIPTURE_LINES_MAX } from './constants.ts';
import { UNLOADABLE_CODES } from './issues.ts';
import type { Role } from '../schema/common.ts';
import type { LessonScope, LessonScopeKey } from '../schema/lesson/scope.ts';
import type { LessonFlaw } from './issues.ts';
import type { ScriptureLine } from './parse.ts';

/** What a scope key is matched against: the session's role, the character's class and tribe, the OS, the quest. */
export interface LessonSession {
  readonly role: Role;
  readonly class: string;
  readonly tribe: string;
  /** `process.platform` of the Steward, the source of shellOf. */
  readonly os: string;
  readonly territory: string;
  readonly tags: readonly string[];
}

/** The ids a scope may name beyond the grammar's own words: the registry's classes and tags, the kingdom's tribes and territories. */
export interface LessonVocabulary {
  readonly classes: readonly string[];
  readonly tribes: readonly string[];
  readonly territories: readonly string[];
  readonly tags: readonly string[];
}

interface WithIds {
  readonly id: string;
}

/** From the registry, the kingdom and its territories (Registry, Kingdom, Territory[] fit). */
export const lessonVocabularyOf = (
  registry: { readonly classes: readonly WithIds[]; readonly tags: readonly WithIds[] },
  kingdom: { readonly tribes: readonly WithIds[] },
  territories: readonly WithIds[],
): LessonVocabulary => ({
  classes: registry.classes.map(({ id }) => id),
  tribes: kingdom.tribes.map(({ id }) => id),
  territories: territories.map(({ id }) => id),
  tags: registry.tags.map(({ id }) => id),
});

// Role and OS are words of the grammar, checked by the parser; the other keys name ids of the kingdom.
const KNOWN_IN: Partial<Record<LessonScopeKey, keyof LessonVocabulary>> = {
  class: 'classes',
  tribe: 'tribes',
  territory: 'territories',
  tag: 'tags',
};

/** The values of a line's scope that the kingdom does not know. */
export const unknownScopeOf = (line: ScriptureLine, vocabulary: LessonVocabulary): LessonFlaw[] =>
  LESSON_SCOPE_KEYS.flatMap((key) => {
    const known = KNOWN_IN[key];
    if (known === undefined) return [];
    return (line.scope[key] ?? [])
      .filter((value) => !vocabulary[known].includes(value))
      .map((value) => ({ code: 'unknown_value' as const, key, value }));
  });

/** Whether a line may load at all: its grammar and scope read, no hidden character, every scope value known. */
export const loadableIn = (line: ScriptureLine, vocabulary: LessonVocabulary): boolean =>
  !line.flaws.some(({ code }) => UNLOADABLE_CODES.includes(code)) &&
  unknownScopeOf(line, vocabulary).length === 0;

const MATCHES: Readonly<
  Record<LessonScopeKey, (values: readonly string[], session: LessonSession) => boolean>
> = {
  role: (values, session) => values.includes(session.role),
  class: (values, session) => values.includes(session.class),
  tribe: (values, session) => values.includes(session.tribe),
  os: (values, session) => values.includes(session.os),
  territory: (values, session) => values.includes(session.territory),
  tag: (values, session) => session.tags.some((tag) => values.includes(tag)),
};

/** Every key present matches; the values of one key are alternatives; no key, every session. */
export const inScope = (scope: LessonScope, session: LessonSession): boolean =>
  LESSON_SCOPE_KEYS.every((key) => {
    const values = scope[key];
    return values === undefined || MATCHES[key](values, session);
  });

export interface LessonSelection<L extends ScriptureLine> {
  /** In load order, the character's lines first, at most SCRIPTURE_LINES_MAX. */
  readonly loaded: readonly L[];
  readonly out_of_scope: readonly L[];
  readonly unreadable: readonly L[];
  /** In scope, after the 40th. */
  readonly over_cap: readonly L[];
}

/** The character's lines, then the temple's, each in file order. */
const inLoadOrder = <L extends ScriptureLine>(lines: readonly L[]): L[] => [
  ...lines.filter(({ owner }) => owner !== 'temple'),
  ...lines.filter(({ owner }) => owner === 'temple'),
];

export function selectLessons<L extends ScriptureLine>(
  lines: readonly L[],
  session: LessonSession,
  vocabulary: LessonVocabulary,
): LessonSelection<L> {
  const ordered = inLoadOrder(lines);
  const readable = ordered.filter((line) => loadableIn(line, vocabulary));
  const within = readable.filter((line) => inScope(line.scope, session));
  return {
    loaded: within.slice(0, SCRIPTURE_LINES_MAX),
    out_of_scope: readable.filter((line) => !inScope(line.scope, session)),
    unreadable: ordered.filter((line) => !loadableIn(line, vocabulary)),
    over_cap: within.slice(SCRIPTURE_LINES_MAX),
  };
}

/** A character as worstLoadOf weighs it: the territories it may work in and every tag a quest may carry. */
export interface LessonProfile {
  readonly class: string;
  readonly tribe: string;
  readonly os: string;
  readonly territories: readonly string[];
  readonly tags: readonly string[];
}

export interface WorstLoad {
  /** The lines in scope before the cap. */
  readonly lines: number;
  readonly role: Role;
  readonly territory: string;
}

/**
 * The heaviest load a character can meet (DB4): for each role and each territory, its loadable lines in scope before
 * the cap, as if the quest carried every tag; the first heaviest wins. With `including`, a line not yet written (the
 * `add` of PS-12c, the 41st line), only the sessions that would load it count. Null when no session counts.
 */
export function worstLoadOf(
  lines: readonly ScriptureLine[],
  profile: LessonProfile,
  vocabulary: LessonVocabulary,
  including?: ScriptureLine,
): WorstLoad | null {
  const all = including === undefined ? lines : [...lines, including];
  const loads = (line: ScriptureLine, session: LessonSession): boolean =>
    loadableIn(line, vocabulary) && inScope(line.scope, session);
  const sessions = profile.territories.flatMap((territory) =>
    ROLES.map((role) => ({ ...profile, role, territory })),
  );
  return sessions
    .filter((session) => including === undefined || loads(including, session))
    .reduce<WorstLoad | null>((worst, session) => {
      const count = all.filter((line) => loads(line, session)).length;
      return worst !== null && worst.lines >= count
        ? worst
        : { lines: count, role: session.role, territory: session.territory };
    }, null);
}
