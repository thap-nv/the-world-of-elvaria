// The secret scan before a push (ADR 0023, (D) of the PS-08 plan; PS-08c): the lines the branch adds, against the
// treasury's values and the patterns of redact. A treasury value or one of the specific shapes (a private key, a
// model provider's key, a forge token…) stops the push; the three shared patterns (a bearer token, credentials in a
// URL, a secret assignment), which match test fixtures and docs often (row 31 of the plan: one delivery in twelve),
// only warn. Only the files are named: a matched line is never written anywhere.
import { REDACT_PATTERNS } from '@elvaria/eventlog';

/**
 * redact-patterns.json lists the specific shapes first and the shared assignments last (REDACT_PATTERNS keeps file
 * order, without ids); scan.spec.ts checks the last three are `bearer_token`, `url_credentials`, `secret_assignment`.
 */
export const SHARED_PATTERN_COUNT = 3;

export interface ScanResult {
  /** Files with a treasury value or a specific shape on an added line: no push. */
  readonly secrets: readonly string[];
  /** Files with a shared pattern only: pushed, named in `delivery.pushed`. */
  readonly warnings: readonly string[];
}

const SPECIFIC = REDACT_PATTERNS.slice(0, -SHARED_PATTERN_COUNT);
const SHARED = REDACT_PATTERNS.slice(-SHARED_PATTERN_COUNT);

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

/** The added lines of `diff` (`git diff -U0`) with their file; a header's `+++` is no added line (an added `++…` is). */
function addedLines(diff: string): { readonly file: string; readonly text: string }[] {
  const added: { file: string; text: string }[] = [];
  let file: string | undefined;
  let header = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) header = true;
    else if (line.startsWith('@@')) header = false;
    else if (header && line.startsWith('+++ ')) file = fileOf(line);
    else if (!header && line.startsWith('+') && file !== undefined) added.push({ file, text: line.slice(1) });
  }
  return added;
}

/** Scans the added lines of `diff`, file by file; `known` are the treasury's values. */
export function scanDiff(diff: string, known: readonly string[]): ScanResult {
  const values = known.filter((value) => value !== '');
  const secrets = new Set<string>();
  const warnings = new Set<string>();
  for (const { file, text } of addedLines(diff)) {
    if (values.some((value) => text.includes(value)) || matches(SPECIFIC, text)) secrets.add(file);
    else if (matches(SHARED, text)) warnings.add(file);
  }
  const warned = [...warnings].filter((file) => !secrets.has(file));
  return { secrets: [...secrets].toSorted(), warnings: warned.toSorted() };
}
