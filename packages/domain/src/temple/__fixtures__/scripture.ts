// Builders for the temple specs (PS-12): a kingdom's vocabulary, a session, and one parsed line.
import { parseScripture } from '../parse.ts';
import type { ScriptureLine } from '../parse.ts';
import type { LessonSession, LessonVocabulary } from '../select.ts';

export const VOCABULARY: LessonVocabulary = {
  classes: ['knight', 'mage', 'scribe'],
  tribes: ['claude', 'codex', 'gemini'],
  territories: ['dc1-se-team', 'elvaria'],
  tags: ['i18n', 'docs', 'api'],
};

/** An assignee knight of the claude tribe on Windows, on a quest of dc1-se-team tagged i18n. */
export const SESSION: LessonSession = {
  role: 'assignee',
  class: 'knight',
  tribe: 'claude',
  os: 'win32',
  territory: 'dc1-se-team',
  tags: ['i18n'],
};

/** The one lesson of a file holding `text` on its first line; owner `temple` unless given. */
export function lineOf(text: string, owner = 'temple'): ScriptureLine {
  const [lesson] = parseScripture(text, owner).lessons;
  if (lesson === undefined) throw new Error(`no lesson in ${JSON.stringify(text)}`);
  return lesson;
}

/** `count` lessons `- Rule <n>.` of `owner`, each with `head` when given. */
export const linesOf = (count: number, owner: string, head = ''): ScriptureLine[] =>
  parseScripture(
    Array.from({ length: count }, (_, index) => `- ${head}Rule ${owner} ${index + 1}.`).join('\n'),
    owner,
  ).lessons.slice();

/** A small seeded generator (mulberry32), so the property spec is the same on every run. */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
