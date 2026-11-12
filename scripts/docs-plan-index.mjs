// The contents table of docs/implementation-plan.md (P1-52): one row per file of docs/implementation-plan/, named by
// the numbered headings it holds, so a section number cited in code or in a doc ("implementation-plan §3.4") leads
// to its file, and one row for the §11 day files. `pnpm docs:gen` renders it into the `plan-index` region of the plan,
// so a new day file or a renamed heading shows up as drift instead of a stale table.
import { posix } from 'node:path';

import { FENCE } from './docs-links.mjs';
import { table } from './docs-markdown.mjs';

/** @typedef {Pick<import('./docs-repo.mjs').Repo, 'list' | 'read'>} RepoReader */

export const PLAN_FILE = 'docs/implementation-plan.md';
export const PLAN_DIR = 'docs/implementation-plan';

const HEADING = /^#{2,3} (.+)$/;
/** `## 2. Title` and `### 2.5 Title`, the numbers code comments cite. */
const NUMBERED = /^(\d+(?:\.\d+)?)\.? (.+)$/;
/** `3.10-event-normalization.md` → 3, 10; `11-2026-11-06.md` → 11. */
const FILE_NUMBER = /^(\d+)(?:\.(\d+))?-/;
const DAY_FILE = /^11-(\d{4}-\d\d-\d\d)\.md$/;
const DONE_FILE = /^8-done-/;
const LAST = Number.MAX_SAFE_INTEGER;

/**
 * The `##` and `###` headings of a Markdown text outside code fences, without their `#`.
 * @param {string} text
 */
export function headingsOf(text) {
  let fenced = false;
  /** @type {string[]} */
  const found = [];
  for (const line of text.split('\n')) {
    if (FENCE.test(line)) fenced = !fenced;
    const heading = fenced ? undefined : HEADING.exec(line)?.[1];
    if (heading !== undefined) found.push(heading);
  }
  return found;
}

/**
 * How the contents table names a file of the plan: `§2 Title · §2.1 Title …`, or the done rows of a §8 part.
 * @param {string} name
 * @param {string} text
 */
export function labelOf(name, text) {
  const headings = headingsOf(text);
  if (DONE_FILE.test(name)) return `§8, task đã xong: ${headings.join(' · ')}`;
  return headings
    .flatMap((heading) => {
      const numbered = NUMBERED.exec(heading);
      return numbered === null ? [] : [`§${numbered[1] ?? ''} ${numbered[2] ?? ''}`];
    })
    .join(' · ');
}

/** @param {string} name */
const orderOf = (name) => {
  const number = FILE_NUMBER.exec(name);
  return [Number(number?.[1] ?? LAST), Number(number?.[2] ?? -1)];
};

/** Section order (3.2 before 3.10), then name. @param {string} a @param {string} b */
export function byNumber(a, b) {
  const [a1 = 0, a2 = 0] = orderOf(a);
  const [b1 = 0, b2 = 0] = orderOf(b);
  return a1 - b1 || a2 - b2 || a.localeCompare(b);
}

/**
 * The body of the `plan-index` region: the files of docs/implementation-plan/ with what they hold.
 * @param {RepoReader} repo
 */
export function renderPlanIndex(repo) {
  const names = repo
    .list()
    .filter((file) => posix.dirname(file) === PLAN_DIR && file.endsWith('.md'))
    .map((file) => posix.basename(file))
    .sort(byNumber);
  const folder = posix.basename(PLAN_DIR);
  /** @param {string} name @param {string} text */
  const link = (name, text) => `[${text}](${folder}/${name})`;
  const rows = names
    .filter((name) => !DAY_FILE.test(name))
    .map((name) => [labelOf(name, repo.read(`${PLAN_DIR}/${name}`) ?? ''), link(name, name)]);
  const days = names.flatMap((name) => {
    const day = DAY_FILE.exec(name)?.[1];
    return day === undefined ? [] : [link(name, day)];
  });
  if (days.length > 0) rows.push(['§11 Nhật ký quyết định, mỗi ngày một file', days.join(' · ')]);
  return `${table(['Mục', 'File'], rows)}\n`;
}
