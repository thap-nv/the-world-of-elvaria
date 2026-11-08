// What a patch for laws.patch_paths may touch (implementation-plan §3.3 "(P1-28)"): pure functions over the patch
// text and over what `git apply --numstat` says it writes. `--numstat` names only where a change lands, never what
// a rename takes away, and `git apply` reads a header whose two names differ as a rename too; so the header lines
// count as well, every `--- `/`+++ ` line included. A hunk line that merely looks like a header (a removed line
// starting with `-- `) can only refuse a patch, never let one through.
import { namesNoGitFolder } from '@elvaria/domain';

import { globToRegExp } from '../checks/glob.ts';

/** C escapes git writes in a quoted path (core.quotePath); octal escapes are the bytes of UTF-8. */
const ESCAPES: Readonly<Record<string, number>> = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  '\\': 92,
};
const OCTAL = /^[0-7]{3}$/;
const TOKEN = /\\([0-7]{3}|.)|[^\\]+/gsu;

/** `"sp ace\tx"` → the name git meant; an unquoted name as it is. */
export function unquoteGitPath(raw: string): string {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) return raw;
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  for (const [token, escaped] of raw.slice(1, -1).matchAll(TOKEN)) {
    if (escaped === undefined) bytes.push(...encoder.encode(token));
    else if (OCTAL.test(escaped)) bytes.push(Number.parseInt(escaped, 8));
    else {
      const code = ESCAPES[escaped];
      bytes.push(...(code === undefined ? encoder.encode(escaped) : [code]));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** The paths of `git apply --numstat -z`: `<added>\t<deleted>\t<path>\0` per file. */
export const numstatPaths = (stdout: string): string[] =>
  stdout
    .split('\0')
    .map((entry) => entry.split('\t').slice(2).join('\t'))
    .filter((name) => name !== '');

/** `a/x` → `x`, as `git apply` (-p1) reads a header name; `/dev/null` is no file. */
function stripped(raw: string): string[] {
  const name = unquoteGitPath(raw.split('\t')[0]?.trim() ?? '');
  if (name === '/dev/null' || name === '') return [];
  const slash = name.indexOf('/');
  return [slash === -1 ? name : name.slice(slash + 1)];
}

/** `diff --git a/x b/x`: the one name both halves give, which is the only one git takes from this line. */
function sameNameOf(rest: string): string[] {
  for (let at = rest.indexOf(' '); at !== -1; at = rest.indexOf(' ', at + 1)) {
    const [left, right] = [stripped(rest.slice(0, at)), stripped(rest.slice(at + 1))];
    if (left[0] !== undefined && left[0] === right[0]) return left;
  }
  return [];
}

const HEADER = /^(?:(---|\+\+\+) |rename (?:from|old) |diff --git )(.*)$/;

/** Every name the header lines of `patch` give, before and after the change. */
export function headerPaths(patch: string): string[] {
  return patch.split(/\r?\n/).flatMap((line) => {
    const match = HEADER.exec(line);
    if (match === null) return [];
    const [, marker, rest = ''] = match;
    if (marker !== undefined) return stripped(rest);
    return line.startsWith('rename') ? [unquoteGitPath(rest.trim())] : sameNameOf(rest);
  });
}

const DRIVE = /^[a-z]:/i;

/** Why `name` is out of the patch's reach whatever the globs say: absolute, outside the plot, git's own folder. */
function outOfReach(name: string): string | undefined {
  if (name.startsWith('/') || DRIVE.test(name)) return 'an absolute path';
  if (name.split('/').includes('..')) return 'outside the plot';
  return namesNoGitFolder(name) ? undefined : "git's own folder";
}

/**
 * Why a patch touching `paths` may not be applied, or undefined when every path is one of `globs`
 * (laws.patch_paths, relative to the plot) and none is git's own folder.
 */
export function patchProblem(paths: readonly string[], globs: readonly string[]): string | undefined {
  const allowed = globs.map(globToRegExp);
  for (const raw of paths) {
    const name = raw.replaceAll('\\', '/').replace(/^(?:\.\/)+/, '');
    const reach = outOfReach(name);
    if (reach !== undefined) return `it touches ${raw}, ${reach}`;
    if (!allowed.some((glob) => glob.test(name))) {
      return `it touches ${raw}, outside laws.patch_paths (${globs.join(', ')})`;
    }
  }
  return undefined;
}
