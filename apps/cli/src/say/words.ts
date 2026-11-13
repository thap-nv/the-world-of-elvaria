// What of the owner's words names code (PS-21b): the paths and globs whose files the Chancellor gets the size of, and
// the code names and paths `graphify query` is asked with. Prose is left out on purpose: the spike found that a
// sentence matches poorly, and Vietnamese words stripped of their marks match code names by chance ("Cần" became
// `canAnimate()`, docs/spikes/graphify-2026-11-12.md §3.1). Only ASCII tokens shaped like code pass.

/** At most this many paths, and this many words in the question: the owner names a few places, not a listing. */
export const WORDS_MAX = 12;

const OPENING = /^[([{"'`<]+/;
const CLOSING = /[\]}"'`>.,;:!?]+$/;
/** A name with an extension (`README.md`, `glossary.json`), not a number (`0.9.106`). */
const FILE_NAME = /^[\w.-]+\.[A-Za-z][A-Za-z0-9]{0,7}$/;
const PATH_CHARS = /^[\w./*?{}[\],@-]+$/;
/** camelCase, PascalCase with a second capital, snake_case, a dotted name or a call: `draftQuests`, `QUEST_TAGS_MAX`. */
const CODE_NAME = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\(\))?$/;
const SHAPED = /[a-z][A-Z]|[A-Z].*[A-Z][a-z]|_|\.|\(\)$/;

/** A token without the sentence's punctuation around it; a call's `()` stays. */
function trimmed(token: string): string {
  const bare = token.replace(OPENING, '').replace(CLOSING, '');
  return bare.endsWith(')') && !bare.endsWith('()') ? trimmed(bare.slice(0, -1)) : bare;
}

interface Token {
  readonly text: string;
  /** In backquotes: the owner marked it as code. */
  readonly quoted: boolean;
}

const split = (text: string, quoted: boolean): Token[] =>
  text
    .split(/\s+/)
    .map(trimmed)
    .filter((token) => token !== '')
    .map((token) => ({ text: token, quoted }));

/** The tokens of the words: what is in backquotes, split on spaces, then every other token. */
function tokensOf(words: string): Token[] {
  const quoted = [...words.matchAll(/`([^`]+)`/g)].flatMap(([, inner = '']) => split(inner, true));
  return [...quoted, ...split(words.replace(/`[^`]+`/g, ' '), false)];
}

const unique = (tokens: readonly string[]): string[] => [...new Set(tokens)].slice(0, WORDS_MAX);

/** Whether a token reads as a path or a glob of a territory: a `/`, a wildcard or a file name; never a URL. */
const isPath = (token: string): boolean =>
  PATH_CHARS.test(token) &&
  !token.startsWith('-') &&
  !token.includes('://') &&
  (token.includes('/') || /[*?]/.test(token) || FILE_NAME.test(token));

/** The paths and globs the words name, backquoted ones first. */
export const namedPathsOf = (words: string): string[] =>
  unique(
    tokensOf(words)
      .map(({ text }) => text)
      .filter(isPath),
  );

/** A name the graph may hold: any code name in backquotes, elsewhere only one shaped like code. */
const isCodeName = ({ text, quoted }: Token): boolean =>
  CODE_NAME.test(text) && (quoted || SHAPED.test(text));

/** The words to ask the code graph with: the paths, and the code names. */
export const codeWordsOf = (words: string): string[] =>
  unique(
    tokensOf(words)
      .filter((token) => isPath(token.text) || isCodeName(token))
      .map(({ text }) => text.replace(/\(\)$/, '')),
  );
