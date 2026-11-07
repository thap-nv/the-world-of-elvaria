// A territory command (`commands.setup`, `checks[].run`, `checks[].cleanup`) as argv. Commands run without a shell
// (ADR 0015), so they are pnpm/node/git command lines without shell syntax (implementation-plan §9.2): words split
// on blanks, '…' and "…" keep a word together, and anything a shell would interpret outside quotes (pipes, `&&`,
// redirection, `$VAR`, subshells, several lines) is refused rather than passed on as a literal argument.
import { err, ok } from '@elvaria/domain';
import type { Result } from '@elvaria/domain';

export type CommandLineIssue = 'empty' | 'shell_syntax' | 'unclosed_quote';

const SHELL_SYNTAX = new Set(['|', '&', ';', '<', '>', '`', '$', '(', ')', '\n', '\r']);
const QUOTES = new Set(['"', "'"]);
const BLANK = /\s/;

/** The words of `line`; a backslash is an ordinary character, so Windows paths need no escaping. */
export function splitCommandLine(line: string): Result<string[], CommandLineIssue> {
  const words: string[] = [];
  // undefined between words; '' for a word opened by a quote, so `""` is an empty argument.
  let word: string | undefined;
  let quote: string | undefined;
  for (const char of line) {
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      else word = (word ?? '') + char;
      continue;
    }
    if (SHELL_SYNTAX.has(char)) return err('shell_syntax');
    if (QUOTES.has(char)) {
      quote = char;
      word ??= '';
    } else if (BLANK.test(char)) {
      if (word !== undefined) words.push(word);
      word = undefined;
    } else {
      word = (word ?? '') + char;
    }
  }
  if (quote !== undefined) return err('unclosed_quote');
  if (word !== undefined) words.push(word);
  return words.length === 0 ? err('empty') : ok(words);
}
