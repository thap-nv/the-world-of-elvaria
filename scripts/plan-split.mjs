// `pnpm plan:split` (P1-52): turns the 1 MB docs/implementation-plan.md into an index and the files of
// docs/implementation-plan/ (plan-layout.mjs), so that no hand-written doc passes 150 KB and a session or a character
// reads only the part it needs. Lines move and are never rewritten, except relative link targets, which follow their
// line (plan-lines.mjs); the lines before and after are compared and one missing fails the run, as does a file over
// 150 KB. On a plan already split, it moves the §8 rows marked done since the last run into the done files. `--check`
// writes nothing and exits 1 when it would write. Merge conflict on the plan: take main's file and run it again.
import process from 'node:process';

import { spliceRegion } from './docs-gen.mjs';
import { PLAN_DIR, PLAN_FILE, renderPlanIndex } from './docs-plan-index.mjs';
import { gitRepo } from './docs-repo.mjs';
import {
  KEPT,
  blocksOf,
  dayRows,
  dayText,
  doneText,
  indexHead,
  moveDone,
  partText,
  sectionFile,
} from './plan-layout.mjs';
import { compareLines, rebaseLines } from './plan-lines.mjs';

/** @typedef {import('./docs-repo.mjs').Repo} Repo */
/** @typedef {Pick<Repo, 'list' | 'read'>} RepoReader */
/**
 * The plan's files before and after, and the lines meant to go: the head of a table emptied into a done file that
 * already has the same head.
 * @typedef {{ before: Map<string, string>; after: Map<string, string>; dropped: string[] }} Move
 */

export const MAX_BYTES = 150 * 1024;
/** A plan not split yet still holds §1; the index never does. */
const UNSPLIT = /^## 1\. /m;
const KIB = 1024;
const SHOWN = 160;

/** Texts compare with LF: the repo stores LF (.gitattributes), a Windows checkout may still hold CRLF. */
const lf = (/** @type {string} */ text) => text.replaceAll('\r\n', '\n');
/** @param {readonly string[]} lines */
const textOf = (lines) => `${lines.join('\n').replace(/\n+$/, '')}\n`;
/** @param {string} file */
const pathOf = (file) => `${PLAN_DIR}/${file}`;
/** Lines written from the index, with their links rewritten for the file they move to. @param {readonly string[]} lines @param {string} file */
const moved = (lines, file) => rebaseLines(lines, PLAN_FILE, pathOf(file));

/**
 * The plan's files after the move, with the contents table rendered from them and from what the repo already holds.
 * @param {Map<string, string>} files repo path → text, the index under PLAN_FILE
 * @param {RepoReader} repo
 * @returns {Map<string, string> | Error}
 */
function withContents(files, repo) {
  const view = {
    list: () => [...new Set([...repo.list(), ...files.keys()])],
    read: (/** @type {string} */ file) => files.get(file) ?? repo.read(file),
  };
  const index = spliceRegion(files.get(PLAN_FILE), 'plan-index', renderPlanIndex(view));
  return index instanceof Error ? index : new Map([...files, [PLAN_FILE, index]]);
}

/**
 * The plan's sections that stay in the index, and the others by the file they move to.
 * @param {string} plan
 */
function sectionsOf(plan) {
  /** @type {Map<string, string[]>} */
  const kept = new Map();
  /** @type {Map<string, { keys: string[]; lines: string[] }>} */
  const parts = new Map();
  for (const block of blocksOf(plan.split('\n'))) {
    const file = KEPT.has(block.key) ? undefined : sectionFile(block.key);
    if (file instanceof Error) return file;
    if (file === undefined) kept.set(block.key, block.lines);
    else {
      const part = parts.get(file) ?? { keys: [], lines: [] };
      parts.set(file, { keys: [...part.keys, block.key], lines: [...part.lines, ...block.lines] });
    }
  }
  const missing = [...KEPT].find((key) => !kept.has(key));
  return missing === undefined ? { kept, parts } : new Error(`the plan has no ${missing} section`);
}

/**
 * The first split: sections into their files, done §8 rows into the done files, §11 rows into day files.
 * @param {string} plan
 * @param {RepoReader} repo
 * @returns {Move | Error}
 */
function split(plan, repo) {
  const sections = sectionsOf(plan);
  if (sections instanceof Error) return sections;
  const { kept, parts } = sections;
  const items = moveDone(kept.get('8') ?? []);
  if (items instanceof Error) return items;
  const log = dayRows(kept.get('11') ?? []);
  if (log instanceof Error) return log;
  /** @type {Map<string, string>} */
  const after = new Map();
  for (const [file, part] of parts) after.set(pathOf(file), partText(part.keys, moved(part.lines, file)));
  for (const [file, { heading, header, rows }] of items.done) {
    after.set(pathOf(file), doneText(heading, header, moved(rows, file)));
  }
  for (const [day, rows] of log.days) {
    const file = `11-${day}.md`;
    after.set(pathOf(file), dayText(day, log.header, moved(rows, file)));
  }
  const index = [
    ...indexHead(kept.get('preamble') ?? []),
    ...items.lines,
    ...(kept.get('10') ?? []),
    ...log.lines,
  ];
  after.set(PLAN_FILE, textOf(index));
  const files = withContents(after, repo);
  return files instanceof Error ? files : { before: new Map([[PLAN_FILE, plan]]), after: files, dropped: [] };
}

/**
 * A later run: the §8 rows marked done since the last one move from the index to the end of the done files.
 * @param {string} index
 * @param {RepoReader} repo
 * @returns {Move | Error}
 */
function archive(index, repo) {
  const lines = index.split('\n');
  const start = lines.findIndex((line) => line.startsWith('## 8. '));
  if (start < 0) return new Error(`${PLAN_FILE} has no §8`);
  const length = lines.slice(start + 1).findIndex((line) => /^(?:---|## \d+\. )/.test(line));
  const end = length < 0 ? lines.length : start + 1 + length;
  const items = moveDone(lines.slice(start, end));
  if (items instanceof Error) return items;
  const before = new Map([[PLAN_FILE, index]]);
  const after = new Map([
    [PLAN_FILE, textOf([...lines.slice(0, start), ...items.lines, ...lines.slice(end)])],
  ]);
  /** @type {string[]} */
  const dropped = [];
  for (const [file, { heading, header, rows, emptied }] of items.done) {
    const was = repo.read(pathOf(file));
    if (was !== undefined) before.set(pathOf(file), lf(was));
    if (was !== undefined && emptied) dropped.push(...header);
    const text = was === undefined ? doneText(heading, header, []) : lf(was);
    // The new rows go right under the last one: a blank line between would end the table.
    after.set(pathOf(file), textOf([...text.replace(/\n+$/, '').split('\n'), ...moved(rows, file)]));
  }
  const files = withContents(after, repo);
  return files instanceof Error ? files : { before, after: files, dropped };
}

/**
 * What the move did, file by file, and why it fails when it does.
 * @param {Move} move
 * @param {readonly string[]} args
 */
function reportOf(move, args) {
  const { lines, lost, added } = compareLines(move.before, move.after, move.dropped);
  const sizes = [...move.after].map(([file, text]) => ({ file, bytes: Buffer.byteLength(text) }));
  const large = sizes.filter(({ bytes }) => bytes > MAX_BYTES).map(({ file }) => `  over 150 KB: ${file}`);
  const heads =
    move.dropped.length > 0 ? `, ${move.dropped.length} lines of emptied table heads dropped` : '';
  const text = [
    `plan-split: ${lines} lines before, ${lost.length} lost, ${added.length} added${heads}, ${move.after.size} files`,
    ...sizes.map(({ file, bytes }) => `  ${file} ${Math.ceil(bytes / KIB)} KB`),
    ...(args.includes('--verbose') ? added.map((line) => `  + ${line.slice(0, SHOWN)}`) : []),
    ...lost.map((line) => `  lost: ${line.slice(0, SHOWN)}`),
    ...large,
  ];
  return { text, failed: lost.length > 0 || large.length > 0 };
}

/**
 * @param {readonly string[]} args
 * @param {Repo} repo
 * @returns {{ code: number; text: string }}
 */
export function run(args, repo) {
  const check = args.includes('--check');
  const plan = repo.read(PLAN_FILE);
  if (plan === undefined) return { code: 1, text: `plan-split: no ${PLAN_FILE}` };
  const move = UNSPLIT.test(lf(plan)) ? split(lf(plan), repo) : archive(lf(plan), repo);
  if (move instanceof Error) return { code: 1, text: `plan-split: ${move.message}` };
  const report = reportOf(move, args);
  if (report.failed) return { code: 1, text: report.text.join('\n') };
  const changed = [...move.after].filter(([file, text]) => {
    const current = repo.read(file);
    return current === undefined || lf(current) !== text;
  });
  if (check) {
    const verdict =
      changed.length === 0 ? 'nothing to move' : `${changed.length} files would change: run pnpm plan:split`;
    return {
      code: changed.length === 0 ? 0 : 1,
      text: [...report.text, `plan-split: ${verdict}`].join('\n'),
    };
  }
  for (const [file, text] of changed) repo.write(file, text);
  return { code: 0, text: [...report.text, `plan-split: ${changed.length} files written`].join('\n') };
}

if (import.meta.main) {
  const { code, text } = run(process.argv.slice(2), gitRepo());
  (code === 0 ? console.log : console.error)(text);
  process.exitCode = code;
}
