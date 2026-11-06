// link-check: every relative link in the matched Markdown files, one unit per link (produces: units).
// Params: { globs: string[] }. Output: { units: [{ id, label, outcome }] }, outcome done = the target exists,
// not_done = it does not, or it leaves the plot. External links (https:, mailto:) and bare #anchors are skipped;
// the anchor part of a link to a file is not checked.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { cli, globFiles, stringList, toPortable } from './common.mjs';

const INLINE_LINK = /!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const REFERENCE_DEFINITION = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /`[^`]*`/g;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** @typedef {{ file: string; line: number; target: string }} Link */

/**
 * Links outside code blocks and code spans, with their 1-based line.
 * @param {string} file portable path, for the result
 * @param {string} markdown
 * @returns {Link[]}
 */
export function findLinks(file, markdown) {
  /** @type {Link[]} */
  const links = [];
  let fence = '';
  markdown.split(/\r?\n/).forEach((raw, index) => {
    const opening = FENCE.exec(raw)?.[1];
    if (opening !== undefined && (fence === '' || opening.startsWith(fence))) {
      fence = fence === '' ? opening : '';
      return;
    }
    if (fence !== '') return;
    const line = raw.replace(INLINE_CODE, '');
    const targets = [...line.matchAll(INLINE_LINK)].map((match) => match[1] ?? '');
    const definition = REFERENCE_DEFINITION.exec(line)?.[1];
    for (const target of definition === undefined ? targets : [...targets, definition]) {
      links.push({ file, line: index + 1, target: target.replace(/^<|>$/g, '') });
    }
  });
  return links;
}

/** `%20` and friends, but a malformed escape is checked as written rather than ending the run. @param {string} target */
function safeDecode(target) {
  try {
    return decodeURI(target);
  } catch {
    return target;
  }
}

/** @param {string} target */
const isChecked = (target) => target !== '' && !EXTERNAL.test(target) && !target.startsWith('#');

/**
 * Where a link points on disk, or undefined when it leaves the plot.
 * @param {string} cwd @param {Link} link @returns {string | undefined}
 */
function resolveTarget(cwd, link) {
  const bare = safeDecode(link.target.replace(/[?#].*$/, ''));
  const base = bare.startsWith('/') ? cwd : path.dirname(path.join(cwd, link.file));
  const resolved = path.resolve(base, bare.replace(/^\/+/, ''));
  const back = path.relative(cwd, resolved);
  return back === '..' || back.startsWith(`..${path.sep}`) ? undefined : resolved;
}

/** Stable across runs, and within the 64 characters a unit id may have. @param {Link} link */
const unitId = (link) =>
  `link-${createHash('sha1').update(`${link.file}\n${link.line}\n${link.target}`).digest('hex').slice(0, 12)}`;

/** @type {import('./common.mjs').ScriptBody} */
export function run(params, _context, cwd) {
  const files = globFiles(cwd, stringList(params, 'globs'));
  const links = files.flatMap((file) => findLinks(file, readFileSync(path.join(cwd, file), 'utf8')));
  const units = links
    .filter((link) => isChecked(link.target))
    .map((link) => {
      const resolved = resolveTarget(cwd, link);
      const alive = resolved !== undefined && existsSync(resolved);
      const where = resolved === undefined ? ' (outside the territory)' : '';
      return {
        id: unitId(link),
        label: `${link.file}:${link.line} -> ${toPortable(link.target)}${where}`,
        outcome: alive ? 'done' : 'not_done',
      };
    });
  return { units };
}

if (import.meta.main) await cli(run);
