// Relative links in the repo's Markdown must reach a file or folder that exists (implementation-plan §5.4).
// Links to the web, mail and in-page anchors are not followed; design/ is the handoff as delivered (ADR 0019).
import { posix } from 'node:path';

const MARKDOWN = /\.md$/;
const SKIPPED = /^(?:design\/|node_modules\/)|\/node_modules\//;
// FENCE, CODE_SPAN, INLINE_LINK and NOT_RELATIVE are shared with plan-lines.mjs, which moves links between files.
export const FENCE = /^\s*(```|~~~)/;
export const CODE_SPAN = /`[^`]*`/g;
/** `[text](target)` and `![alt](target)`, with an optional title; `<target>` may hold spaces. */
export const INLINE_LINK = /!?\[(?:[^\]\\]|\\.)*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const REFERENCE = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/;
/** A scheme (`https:`, `mailto:`), a protocol-relative URL, or an anchor in the same file. */
export const NOT_RELATIVE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/** Link targets per line, outside code fences and code spans. @param {string} text */
export function linksOf(text) {
  /** @type {{ target: string; line: number }[]} */
  const links = [];
  let fenced = false;
  text.split('\n').forEach((raw, index) => {
    if (FENCE.test(raw)) fenced = !fenced;
    if (fenced || FENCE.test(raw)) return;
    const line = raw.replace(CODE_SPAN, '');
    const targets = [...line.matchAll(INLINE_LINK)].map((match) => match[1] ?? '');
    const reference = REFERENCE.exec(line)?.[1];
    for (const target of reference === undefined ? targets : [...targets, reference]) {
      links.push({ target: target.replace(/^<|>$/g, ''), line: index + 1 });
    }
  });
  return links;
}

/** The repo path a relative link points to, or undefined for a link this check does not follow. */
export function resolveLink(/** @type {string} */ from, /** @type {string} */ target) {
  if (NOT_RELATIVE.test(target)) return undefined;
  const path = target.split(/[#?]/)[0] ?? '';
  if (path === '') return undefined;
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // A malformed escape stays as written; the existence check reports it.
  }
  const joined = decoded.startsWith('/') ? decoded.slice(1) : posix.join(posix.dirname(from), decoded);
  return posix.normalize(joined).replace(/\/$/, '');
}

/**
 * `<file>:<line>: broken link <target>` for every relative link that reaches nothing.
 * @param {readonly string[]} files every repo file, repo-relative with `/`
 * @param {(file: string) => string | undefined} read
 */
export function linkProblems(files, read) {
  const known = new Set(files);
  for (const file of files) {
    for (let dir = posix.dirname(file); dir !== '.'; dir = posix.dirname(dir)) known.add(dir);
  }
  return files
    .filter((file) => MARKDOWN.test(file) && !SKIPPED.test(file))
    .flatMap((file) =>
      linksOf(read(file) ?? '').flatMap(({ target, line }) => {
        const path = resolveLink(file, target);
        const alive = path === undefined || path === '.' || known.has(path);
        return alive ? [] : [`${file}:${line}: broken link ${target}`];
      }),
    );
}
