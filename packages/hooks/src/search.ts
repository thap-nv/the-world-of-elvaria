// Search commands for a tribe whose CLI has no search tool (P1-53, implementation-plan §3.7): runner-core gives a
// class with Glob or Grep `git grep` and `git ls-files` (policy `search_commands`), and agy's settings allow them as
// prefixes. A prefix also matches `git grep -O<pager> x`, so the hook, which sees the whole line, refuses the options
// that run a program or reach files git does not track (where dotenv files are), and lets a class without a shell
// run only plain search lines, which neither PowerShell nor bash reads as more than words.

/**
 * Long options of git grep that run a program (`--open-files-in-pager`; `--textconv`, the textconv filters of the
 * owner's git config) or read files git does not track (`--no-index` reads ignored files, `.env` among them, and
 * `--untracked`). Git takes any unambiguous abbreviation: `--no-ind`, `--open`, `--textc` (git 2.56, P1-53).
 */
const REFUSED_LONG = ['open-files-in-pager', 'no-index', 'untracked', 'textconv'] as const;
/** Options git takes whole although they begin a refused one: `--text` is not `--textconv`. */
const WHOLE = new Set(['text']);
/** Short options of git grep whose value may follow in the same word (`-e<pattern>`, `-A3`). */
const VALUE_LETTERS = new Set(['e', 'f', 'A', 'B', 'C', 'm']);
/** `-O[<pager>]`, alone or among other short options: `-nO`, `-nOvim`. */
const PAGER_LETTER = 'O';
const GIT_WORD = /^(?:.*[\\/])?git(?:\.exe)?$/i;

/** The words of a line as git may receive them, under PowerShell's or bash's quoting: quotes and escapes dropped. */
const wordsOf = (command: string): string[] =>
  command
    .replace(/["'`]/g, '')
    .split(/[\s;|&<>(){},]+/)
    .filter((word) => word !== '');

/** The refused option `word` is, or holds among short options; undefined for any other word. */
function refusedOption(word: string): string | undefined {
  // bash reads `\-O` as `-O`; PowerShell keeps the backslash, which no option starts with.
  const plain = word.replaceAll('\\', '');
  if (plain.startsWith('--')) {
    const name = plain.slice(2).split('=')[0] ?? '';
    if (name === '' || WHOLE.has(name)) return undefined;
    const long = REFUSED_LONG.find((option) => option.startsWith(name));
    return long === undefined ? undefined : `--${long}`;
  }
  if (!plain.startsWith('-')) return undefined;
  for (const letter of plain.slice(1)) {
    if (letter === PAGER_LETTER) return `-${PAGER_LETTER}`;
    if (VALUE_LETTERS.has(letter)) return undefined;
  }
  return undefined;
}

/**
 * Why `command` runs git grep with an option that runs a program or reaches past the tracked files, if it does.
 * Every word after `git … grep` is weighed, values too: `-e '--no-index'` is refused, because PowerShell and bash do
 * not split every line alike (Windows PowerShell drops an empty `''`), so a word's place cannot be trusted.
 */
export function grepOptionViolation(command: string): string | undefined {
  const words = wordsOf(command);
  const git = words.findIndex((word) => GIT_WORD.test(word));
  const grep = words.findIndex((word, index) => git !== -1 && index > git && word === 'grep');
  if (grep === -1) return undefined;
  const option = words.slice(grep + 1).flatMap((word) => refusedOption(word) ?? [])[0];
  return option === undefined
    ? undefined
    : `git grep ${option} is refused: it runs a program or reaches files git does not track, such as the territory's dotenv files; search the tracked files without it`;
}

/** What a shell reads outside quotes as more than words, in PowerShell or bash (bash also expands `*?[` to names). */
const SHELL_SIGNS = new Set([';', '|', '&', '<', '>', '(', ')', '{', '}', '$', '@', '`', ',', '*', '?', '[']);
/** What PowerShell or bash still reads inside double quotes: variables, subexpressions, escapes. */
const DOUBLE_SIGNS = new Set(['$', '`']);
const LINE_BREAK = /[\r\n\0]/;
/** PowerShell takes typographic quotes for quotes, bash does not: the two would split the line differently. */
const SMART_QUOTES = /[‘-‟]/;

/**
 * What makes `command` more than one plain call, if anything: inside single quotes both shells read text; a
 * backslash before a quote is where they part (bash escapes the quote, PowerShell does not), so it is refused
 * rather than guessed.
 */
export function plainLineProblem(command: string): string | undefined {
  if (LINE_BREAK.test(command)) return 'a line break';
  if (SMART_QUOTES.test(command)) return 'a typographic quote';
  let quote: string | undefined;
  // UTF-16 units are enough: every sign weighed here is ASCII, and no half of a surrogate pair is one.
  for (let index = 0; index < command.length; index += 1) {
    const char = command.charAt(index);
    if (quote === "'") {
      if (char === "'") quote = undefined;
    } else if (char === '\\' && /["']/.test(command.charAt(index + 1))) {
      return 'a backslash before a quote';
    } else if (quote === '"') {
      if (char === '"') quote = undefined;
      else if (DOUBLE_SIGNS.has(char)) return `${char} inside double quotes`;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (SHELL_SIGNS.has(char)) {
      return `${char} outside quotes`;
    }
  }
  return quote === undefined ? undefined : 'a quote left open';
}

/** The search command `command` starts with, as agy's prefix rule reads it; undefined for any other line. */
export function searchCommandOf(command: string, searchCommands: readonly string[]): string | undefined {
  const line = command.trim();
  return searchCommands.find(
    (search) => line === search || (line.startsWith(search) && /^\s/.test(line.slice(search.length))),
  );
}

/** Why a class without a shell may not run a search line that has `problem` (plainLineProblem). */
export const plainSearchReason = (problem: string, searchCommands: readonly string[]): string =>
  `your class has no shell, only ${searchCommands.join(' and ')}, each alone on its line with its patterns and paths in single quotes; this line has ${problem}`;
