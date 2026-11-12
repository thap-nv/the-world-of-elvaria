// Lines that move between Markdown files (P1-52, plan-split.mjs): a relative link keeps reaching the same file after
// its line moves, and the lines before and after a move are compared, so a move that loses one fails. Links are read
// the way docs-links.mjs reads them: not inside code fences or code spans, only relative targets.
import { posix } from 'node:path';

import { CODE_SPAN, FENCE, INLINE_LINK, NOT_RELATIVE } from './docs-links.mjs';

/** Everything of a link up to its target: `[text](` or `![alt](`, with the spaces before the target. */
const LINK_HEAD = /^!?\[(?:[^\]\\]|\\.)*\]\(\s*/;

/**
 * The line with every link target passed through `map`. Links are found as docs-links.mjs finds them, with code
 * spans blanked out (a link whose text is a code span still counts; a target inside one does not), so the blanks
 * are spaces of the same length and a match's offsets hold in the line itself.
 * @param {string} line
 * @param {(target: string) => string} map
 */
function mapLinks(line, map) {
  const masked = line.replace(CODE_SPAN, (span) => ' '.repeat(span.length));
  let out = '';
  let from = 0;
  for (const link of masked.matchAll(INLINE_LINK)) {
    const target = link[1] ?? '';
    const at = link.index + (LINK_HEAD.exec(link[0])?.[0].length ?? 0);
    out += `${line.slice(from, at)}${map(target)}`;
    from = at + target.length;
  }
  return `${out}${line.slice(from)}`;
}

/**
 * The repo path a relative target reaches from `from`, with its anchor or query; undefined when the target is not
 * a relative path (the web, mail, an anchor in the same file, a path from the repo root).
 * @param {string} from repo-relative path of the file holding the link
 * @param {string} target as written, `<…>` dropped
 */
function reach(from, target) {
  if (NOT_RELATIVE.test(target) || target.startsWith('/')) return undefined;
  const cut = target.search(/[#?]/);
  const path = cut < 0 ? target : target.slice(0, cut);
  if (path === '') return undefined;
  const slash = path.endsWith('/') ? '/' : '';
  return {
    path: posix.normalize(posix.join(posix.dirname(from), path)).replace(/\/$/, ''),
    slash,
    rest: target.slice(path.length),
  };
}

/**
 * A target rewritten by `rewrite`, keeping `<…>` when it had them.
 * @param {string} written
 * @param {(target: string) => string} rewrite
 */
function bracketed(written, rewrite) {
  const angled = written.startsWith('<') && written.endsWith('>');
  const target = angled ? written.slice(1, -1) : written;
  const result = rewrite(target);
  return angled ? `<${result}>` : result;
}

/**
 * The lines of a Markdown text, each passed through `map` unless it lies in a code fence.
 * @param {readonly string[]} lines
 * @param {(line: string) => string} map
 */
function outsideFences(lines, map) {
  let fenced = false;
  return lines.map((line) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return line;
    }
    return fenced ? line : map(line);
  });
}

/**
 * Lines moved from the file `from` into the file `to`, relative link targets rewritten to reach the same file.
 * @param {readonly string[]} lines
 * @param {string} from repo-relative path, `/`
 * @param {string} to repo-relative path, `/`
 */
export function rebaseLines(lines, from, to) {
  if (posix.dirname(from) === posix.dirname(to)) return [...lines];
  /** @param {string} target */
  const rewrite = (target) => {
    const reached = reach(from, target);
    if (reached === undefined) return target;
    const relative = posix.relative(posix.dirname(to), reached.path) || '.';
    return `${relative}${reached.slash}${reached.rest}`;
  };
  return outsideFences(lines, (line) => mapLinks(line, (written) => bracketed(written, rewrite)));
}

/**
 * The lines of a file as compared across a move: relative link targets written from the repo root, blank lines out.
 * @param {string} file
 * @param {string} text
 */
function comparableLines(file, text) {
  /** @param {string} target */
  const rewrite = (target) => {
    const reached = reach(file, target);
    return reached === undefined ? target : `/${reached.path}${reached.slash}${reached.rest}`;
  };
  const lines = outsideFences(text.split('\n'), (line) =>
    mapLinks(line, (written) => bracketed(written, rewrite)),
  );
  return lines.filter((line) => line.trim() !== '');
}

/** @param {ReadonlyMap<string, string>} files repo path → text */
function census(files) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const [file, text] of files) {
    for (const line of comparableLines(file, text)) counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return counts;
}

/**
 * Every non-blank line of `before` that `after` holds fewer times (`lost`), and every line `after` holds more times
 * (`added`: headers, contents, pointers). Lines compare with their relative links resolved, so a moved line whose
 * link was rebased still counts as the same line.
 * @param {ReadonlyMap<string, string>} before repo path → text
 * @param {ReadonlyMap<string, string>} after repo path → text
 * @param {readonly string[]} dropped lines meant to go, counted as kept: the head of a table emptied into a done
 *   file that already has the same head
 */
export function compareLines(before, after, dropped = []) {
  const was = census(before);
  const now = census(after);
  for (const line of dropped) now.set(line, (now.get(line) ?? 0) + 1);
  /** @param {Map<string, number>} more @param {Map<string, number>} less */
  const surplus = (more, less) =>
    [...more].flatMap(([line, count]) => Array.from({ length: count - (less.get(line) ?? 0) }, () => line));
  const lines = [...was.values()].reduce((sum, count) => sum + count, 0);
  return { lines, lost: surplus(was, now), added: surplus(now, was) };
}
