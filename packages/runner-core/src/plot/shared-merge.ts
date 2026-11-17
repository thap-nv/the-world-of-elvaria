// The territory's rules for its hot files (implementation-plan §3.16.5, ADR 0028; PS-09, K3 of the merge-queue plan):
// which conflicted file of a merge a rule resolves, and how, decided from what git wrote; the git around it lives in
// base-update.ts. `regenerate` keeps the plot's side of a generated file, whose right content commands.generate makes
// afterwards; `union` joins the two sides line by line inside each conflict, three-way: a line one side changed takes
// that side, lines both sides only added are all kept (the incoming branch's first), the same line changed two ways is
// a real conflict, and a JSON file must still parse. A file no rule names is a conflict: a knight's, or the owner's.
import type { Territory } from '@elvaria/domain';

import { globToRegExp } from '../checks/glob.ts';

type SharedPath = NonNullable<Territory['shared_paths']>[number];
export type SharedRule = SharedPath['merge'];

/** One conflicted file of a merge, as the shell read it; both texts are read only for a file `union` names. */
export interface ConflictedFile {
  /** Relative to the plot, `/` separators. */
  readonly path: string;
  /** The file as the merge wrote it, with diff3 markers; null when git wrote none (a binary, a deletion). */
  readonly merged: string | null;
  /** The plot's own side (stage 2), whose line endings the result keeps; null when the plot's side deleted it. */
  readonly ours: string | null;
}

export type FileResolution =
  | { readonly path: string; readonly outcome: 'resolved'; readonly rule: 'regenerate' }
  | { readonly path: string; readonly outcome: 'resolved'; readonly rule: 'union'; readonly content: string }
  | { readonly path: string; readonly outcome: 'conflict' };

/** The rule of the first shared glob that matches `path`; undefined for a file that is not hot. */
export function ruleOf(path: string, shared: readonly SharedPath[]): SharedRule | undefined {
  return shared.find(({ glob }) => globToRegExp(glob).test(path))?.merge;
}

const MARKER_SIZE = 7;
type Marker = '<' | '|' | '=' | '>';

/** Whether `line` (no line ending) is a conflict marker of git's default size. */
function isMarker(line: string, kind: Marker): boolean {
  const run = kind.repeat(MARKER_SIZE);
  if (!line.startsWith(run)) return false;
  const rest = line.slice(MARKER_SIZE);
  return kind === '=' ? rest === '' : rest === '' || rest.startsWith(' ');
}

/** One conflict's three sides: the plot's, the common ancestor's, the incoming branch's. */
interface Hunk {
  readonly ours: readonly string[];
  readonly base: readonly string[];
  readonly theirs: readonly string[];
}

/** The lines of one conflict, joined, or undefined when they are a real conflict (K3). */
export function joinHunk({ ours, base, theirs }: Hunk): string[] | undefined {
  if (base.length === 0) return [...theirs, ...ours];
  if (ours.length !== base.length || theirs.length !== base.length) return undefined;
  const joined: string[] = [];
  for (const [index, was] of base.entries()) {
    const [mine, incoming] = [ours[index] ?? '', theirs[index] ?? ''];
    if (mine !== was && incoming !== was && mine !== incoming) return undefined;
    joined.push(mine === was ? incoming : mine);
  }
  return joined;
}

/** Reads one diff3 conflict from `lines[start]` (its `<<<<<<<`); undefined when it is not one git closed. */
function hunkAt(lines: readonly string[], start: number): { hunk: Hunk; end: number } | undefined {
  const at = (kind: Marker, from: number) =>
    lines.findIndex((line, index) => index >= from && isMarker(line, kind));
  const bar = at('|', start + 1);
  const equals = at('=', start + 1);
  const close = at('>', start + 1);
  if (bar === -1 || equals < bar || close < equals) return undefined;
  const hunk = {
    ours: lines.slice(start + 1, bar),
    base: lines.slice(bar + 1, equals),
    theirs: lines.slice(equals + 1, close),
  };
  return { hunk, end: close + 1 };
}

/**
 * The file `merged` (diff3 markers) with each conflict joined, its lines ending as `ours` ends them; undefined when
 * one conflict is real, or when git wrote no conflict to join.
 */
export function unionOf(merged: string, ours: string): string | undefined {
  const eol = ours.includes('\r\n') ? '\r\n' : '\n';
  const lines = merged.split('\n').map((line) => line.replace(/\r$/, ''));
  const last = lines.pop();
  if (last !== undefined && last !== '') lines.push(last);
  const out: string[] = [];
  let hunks = 0;
  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? '';
    if (!isMarker(line, '<')) {
      out.push(line);
      index += 1;
      continue;
    }
    const read = hunkAt(lines, index);
    const joined = read === undefined ? undefined : joinHunk(read.hunk);
    if (read === undefined || joined === undefined) return undefined;
    out.push(...joined);
    hunks += 1;
    index = read.end;
  }
  if (hunks === 0) return undefined;
  return out.join(eol) + (last === '' ? eol : '');
}

const parses = (text: string): boolean => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

/** One file's resolution by the territory's rules. */
function resolveOne(file: ConflictedFile, shared: readonly SharedPath[]): FileResolution {
  const { path } = file;
  const rule = ruleOf(path, shared);
  if (rule === 'regenerate') return { path, outcome: 'resolved', rule };
  if (rule === undefined || file.merged === null || file.ours === null) return { path, outcome: 'conflict' };
  const content = unionOf(file.merged, file.ours);
  if (content === undefined || (path.toLowerCase().endsWith('.json') && !parses(content)))
    return { path, outcome: 'conflict' };
  return { path, outcome: 'resolved', rule, content };
}

/** Each conflicted file resolved by the territory's `shared_paths`, or a conflict; in the order given. */
export function resolveShared(
  files: readonly ConflictedFile[],
  shared: readonly SharedPath[],
): FileResolution[] {
  return files.map((file) => resolveOne(file, shared));
}
