// The secret scan before a push (ADR 0023, (D) of the PS-08 plan; PS-08c): the lines the branch adds, against the
// treasury's values and the patterns of redact. A treasury value or one of the specific shapes (a private key, a
// model provider's key, a forge token…) stops the push; the three shared patterns (a bearer token, credentials in a
// URL, a secret assignment), which match test fixtures and docs often (row 31 of the plan: one delivery in twelve),
// only warn. Only the files are named: a matched line is never written anywhere. (fix/push-scan, (212)) `git push`
// sends every commit of the branch, so the scan reads each commit's own added lines too, not only the branch's whole
// diff, and names the commits that add a secret: a secret added then removed is on the remote all the same.
import { REDACT_PATTERNS } from '@elvaria/eventlog';

/** A commit of the branch whose own added lines hold a secret, and the files they are in. */
export interface CommitSecrets {
  readonly sha: string;
  readonly files: readonly string[];
}

export interface ScanResult {
  /** Files with a treasury value or a specific shape on an added line: no push. */
  readonly secrets: readonly string[];
  /** Files with a shared pattern only: pushed, named in `delivery.pushed`. */
  readonly warnings: readonly string[];
  /** The commits that add a secret, in the order git log lists them; a secret no commit line precedes names none. */
  readonly commits: readonly CommitSecrets[];
}

/**
 * The line git log prints before each commit's diff (`git log -p --format=<COMMIT_FORMAT>`). No line of a `-U0` diff
 * starts so: a header starts with its own word, a hunk line with `@@`, `+`, `-` or `\`.
 */
export const COMMIT_FORMAT = 'commit %H';
/** A SHA-1 or a SHA-256 object name. */
const COMMIT_LINE = /^commit ([0-9a-f]{40}(?:[0-9a-f]{24})?)$/;

const SPECIFIC = REDACT_PATTERNS.filter((pattern) => !pattern.warn_only);
const SHARED = REDACT_PATTERNS.filter((pattern) => Boolean(pattern.warn_only));

const matches = (patterns: readonly RegExp[], line: string): boolean =>
  patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(line);
  });

/** git's C-style escapes in a quoted path (quote.c); a control byte is three octal digits. */
const ESCAPES: Readonly<Record<string, string>> = {
  a: '\u0007',
  b: '\b',
  t: '\t',
  n: '\n',
  v: '\v',
  f: '\f',
  r: '\r',
};
const OCTAL = 8;

const unquoted = (name: string): string =>
  name
    .slice(1, -1)
    .replaceAll(/\\(?:([0-7]{3})|(.))/g, (_, octal: string | undefined, other: string) =>
      octal === undefined ? (ESCAPES[other] ?? other) : String.fromCharCode(Number.parseInt(octal, OCTAL)),
    );

/**
 * The file a `+++ b/<path>` header names; `/dev/null` (a deletion) names none. git ends the header with a tab when
 * the path holds a space, and quotes a path with a `"`, a `\` or a control character ("b/…") even under
 * core.quotePath=false: such a file is scanned under its own name all the same.
 */
const fileOf = (header: string): string | undefined => {
  const label = header.slice('+++ '.length).replace(/\t$/, '');
  const name = label.startsWith('"') && label.endsWith('"') ? unquoted(label) : label;
  return name.startsWith('b/') ? name.slice('b/'.length) : undefined;
};

interface AddedLine {
  /** The commit whose diff holds the line; absent before git log's first commit line (a plain diff). */
  readonly commit?: string;
  readonly file: string;
  readonly text: string;
}

/**
 * The added lines of `diff` with their file and commit; a header's `+++` is no added line (an added `++…` is). A commit
 * line starts a new commit's diff, so its first file is never the one before.
 */
function addedLines(diff: string): AddedLine[] {
  const added: AddedLine[] = [];
  let commit: string | undefined;
  let file: string | undefined;
  let header = false;
  for (const line of diff.split('\n')) {
    const sha = COMMIT_LINE.exec(line)?.[1];
    if (sha !== undefined) [commit, file, header] = [sha, undefined, false];
    else if (line.startsWith('diff --git ')) header = true;
    else if (line.startsWith('@@')) header = false;
    else if (header && line.startsWith('+++ ')) file = fileOf(line);
    else if (!header && line.startsWith('+') && file !== undefined)
      added.push({ ...(commit === undefined ? {} : { commit }), file, text: line.slice(1) });
  }
  return added;
}

/** Each commit's files with a secret, in the order the commits first came. */
function commitsOf(found: readonly { readonly commit: string; readonly file: string }[]): CommitSecrets[] {
  const files = new Map<string, Set<string>>();
  for (const { commit, file } of found) files.set(commit, (files.get(commit) ?? new Set<string>()).add(file));
  return [...files].map(([sha, named]) => ({ sha, files: [...named].toSorted() }));
}

/**
 * Scans the added lines of `diff`, file by file; `known` are the treasury's values. `diff` is a `git diff -U0`, a
 * `git log -p -U0 --format=<COMMIT_FORMAT>` whose commits are named, or the one followed by the other.
 */
export function scanDiff(diff: string, known: readonly string[]): ScanResult {
  const values = known.filter((value) => value !== '');
  const secrets = new Set<string>();
  const warnings = new Set<string>();
  const found: { commit: string; file: string }[] = [];
  for (const { commit, file, text } of addedLines(diff)) {
    if (values.some((value) => text.includes(value)) || matches(SPECIFIC, text)) {
      secrets.add(file);
      if (commit !== undefined) found.push({ commit, file });
    } else if (matches(SHARED, text)) warnings.add(file);
  }
  const warned = [...warnings].filter((file) => !secrets.has(file));
  return { secrets: [...secrets].toSorted(), warnings: warned.toSorted(), commits: commitsOf(found) };
}
