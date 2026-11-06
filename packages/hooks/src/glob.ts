// Globs of `laws.forbidden_paths` (implementation-plan §2.3) as regular expressions. The hook may load nothing
// but node:fs/path/process and the event log (§1.4), so this is a small converter, not a glob library.

const escapeChar = (char: string): string => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A `[...]` class from `glob[start]`; `[!...]` negates. Undefined when it is not closed: then `[` is literal. */
function charClass(glob: string, start: number): { source: string; end: number } | undefined {
  const close = glob.indexOf(']', start + 2);
  if (close === -1) return undefined;
  const body = glob
    .slice(start + 1, close)
    .replace(/^!/, '^')
    .replaceAll('\\', '\\\\');
  return { source: `[${body}]`, end: close + 1 };
}

/** `**` at `index`: any depth when it is a whole segment, else like `*`. Returns the source and next index. */
function globstar(glob: string, index: number): { source: string; end: number } {
  const wholeStart = index === 0 || glob[index - 1] === '/';
  const after = glob[index + 2];
  if (wholeStart && after === '/') return { source: '(?:.*/)?', end: index + 3 };
  if (wholeStart && after === undefined) return { source: '.*', end: index + 2 };
  return { source: '[^/]*', end: index + 2 };
}

/** The source of one token at `index` of `glob`, and where the next token starts. */
function token(glob: string, index: number, braces: number): { source: string; end: number } {
  const char = glob.charAt(index);
  if (char === '*' && glob[index + 1] === '*') return globstar(glob, index);
  if (char === '/' && glob.slice(index + 1) === '**') return { source: '(?:/.*)?', end: glob.length };
  if (char === '*') return { source: '[^/]*', end: index + 1 };
  if (char === '?') return { source: '[^/]', end: index + 1 };
  if (char === '[') return charClass(glob, index) ?? { source: '\\[', end: index + 1 };
  if (char === '{') return { source: '(?:', end: index + 1 };
  if (char === '}' && braces > 0) return { source: ')', end: index + 1 };
  if (char === ',' && braces > 0) return { source: '|', end: index + 1 };
  return { source: escapeChar(char), end: index + 1 };
}

/**
 * A forbidden path glob as an anchored, case-insensitive RegExp over `/`-separated paths: `**` spans folders,
 * `*` and `?` stay within one, `[...]` and `{a,b}` work as in a shell, and `dir/**` also matches `dir` itself
 * (reading a folder reaches its files). Case-insensitive because Windows and macOS file systems are, so
 * `.ENV` is the same file as `.env` there.
 */
export function globToRegExp(glob: string): RegExp {
  const pattern = glob.replaceAll('\\', '/').replace(/^(?:\.\/|\/)+/, '');
  let source = '';
  let braces = 0;
  for (let index = 0; index < pattern.length;) {
    const next = token(pattern, index, braces);
    if (next.source === '(?:') braces += 1;
    if (next.source === ')') braces -= 1;
    source += next.source;
    index = next.end;
  }
  // An unclosed `{` would make an invalid RegExp; close it so the glob still means something.
  return new RegExp(`^${source}${')'.repeat(braces)}$`, 'i');
}
