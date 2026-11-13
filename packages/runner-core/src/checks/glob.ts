// Globs of `checks[].when` (implementation-plan §2.3) as regular expressions. They read like the globs of
// `laws.forbidden_paths`, which the hook matches with its own converter (packages/hooks/src/glob.ts, which may
// import nothing from here, §1.4): one territory file, one meaning of a glob. Node's `path.matchesGlob` skips
// names that start with a dot, so a touched `.github/workflows/ci.yml` would run no `**/*.yml` check; a check
// left out is a judge left out, so this matcher errs on the side of running it.

const escapeChar = (char: string): string => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Piece {
  readonly source: string;
  readonly end: number;
}

/** A `[...]` class from `glob[start]`; `[!...]` negates. Undefined when it is not closed: then `[` is literal. */
function charClass(glob: string, start: number): Piece | undefined {
  const close = glob.indexOf(']', start + 2);
  if (close === -1) return undefined;
  const body = glob
    .slice(start + 1, close)
    .replace(/^!/, '^')
    .replaceAll('\\', '\\\\');
  return { source: `[${body}]`, end: close + 1 };
}

/** `**` at `index`: any depth when it is a whole segment, else like `*`. */
function globstar(glob: string, index: number): Piece {
  const wholeStart = index === 0 || glob[index - 1] === '/';
  const after = glob[index + 2];
  if (wholeStart && after === '/') return { source: '(?:.*/)?', end: index + 3 };
  if (wholeStart && after === undefined) return { source: '.*', end: index + 2 };
  return { source: '[^/]*', end: index + 2 };
}

/** The source of one token at `index` of `glob`, and where the next token starts. */
function token(glob: string, index: number, braces: number): Piece {
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
 * A glob as an anchored, case-insensitive RegExp over `/`-separated paths relative to the plot: `**` spans
 * folders, `*` and `?` stay within one and match dot names too, `[...]` and `{a,b}` work as in a shell.
 * Case-insensitive because Windows and macOS file systems are.
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

/**
 * Whether a glob of a scope covers a path (PS-05, ADR 0028): by the glob, or as a folder when it names one without a
 * wildcard (`apps/web` covers `apps/web/src/x.ts`). The judge's files outside the scope and the code graph's links
 * between scopes (PS-21b) read a scope alike.
 */
export function coverOf(glob: string): (path: string) => boolean {
  const pattern = globToRegExp(glob);
  const folder = `${glob
    .replaceAll('\\', '/')
    .replace(/^(?:\.\/|\/)+/, '')
    .replace(/\/+$/, '')
    .toLowerCase()}/`;
  return (path) => pattern.test(path) || path.toLowerCase().startsWith(folder);
}

/** `(path, globs)`: whether one of the globs covers the path, each glob made into a RegExp once (coverOf). */
export function scopeCovers(): (path: string, globs: readonly string[]) => boolean {
  const made = new Map<string, (path: string) => boolean>();
  const cover = (glob: string): ((path: string) => boolean) => {
    const known = made.get(glob);
    if (known !== undefined) return known;
    const fresh = coverOf(glob);
    made.set(glob, fresh);
    return fresh;
  };
  return (path, globs) => globs.some((glob) => cover(glob)(path));
}
