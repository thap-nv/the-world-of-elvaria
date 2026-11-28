// `pnpm coverage:unrun --run <dir> [--run <dir>…] [--summary] [--out <file>]` (AH-15; plans/architecture-health.md
// V15, K12): by workspace, the lines the tests run that real runs did not. A report, not a gate: an error path no
// run met is still code to keep (K12). A line only the tests reach asks a reader whether the runs never take that
// path, or whether nothing in production calls it any more.
//
// The tests' side is the coverage/coverage-final.json each workspace's `vitest run --coverage` writes (`pnpm test`):
// a line counts when a statement that starts on it ran. The runs' side is one or more NODE_V8_COVERAGE folders
// (unrun-v8.mjs): a line ran when a run executed the first character of one of those statements. How to collect
// them (`elvaria sandbox replay`, the conformance suite with the fake CLIs, a kingdom day): docs/guides/repo-handbook.md.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { readRuns } from './unrun-v8.mjs';

/** @typedef {import('./unrun-v8.mjs').Runs} Runs */
/** @typedef {{ start: { line: number; column: number } }} Location */
/** @typedef {{ path: string; statementMap: Record<string, Location>; s: Record<string, number> }} FileCoverage */
/**
 * A source file the tests ran: its text and, by line, the columns where a statement that ran starts.
 * @typedef {{ rel: string; text: string; lines: Map<number, number[]> }} TestFile
 */
/**
 * One workspace of the report: lines the tests ran in files a run could be compared on, those no run ran, files
 * compared, files no run loaded, files whose run copy differs, and one detail line per file with a line not run.
 * @typedef {{ workspace: string; tested: number; unrun: number; files: number; unloaded: number; differs: number;
 *   details: string[] }} Row
 */

const WORKSPACE_PARENTS = ['packages', 'apps'];
const TEST_COVERAGE = 'coverage/coverage-final.json';
const USAGE = 'usage: coverage:unrun --run <NODE_V8_COVERAGE dir> [--run <dir>…] [--summary] [--out <file>]';
const PERCENT = 100;

/**
 * @param {string} root
 * @param {FileCoverage} entry
 * @returns {TestFile}
 */
function testFileOf(root, entry) {
  /** @type {Map<number, number[]>} */
  const lines = new Map();
  for (const [id, count] of Object.entries(entry.s)) {
    const start = entry.statementMap[id]?.start;
    if (count > 0 && start !== undefined)
      lines.set(start.line, [...(lines.get(start.line) ?? []), start.column]);
  }
  const rel = relative(root, entry.path).replaceAll('\\', '/');
  return { rel, text: readFileSync(entry.path, 'utf8'), lines };
}

/**
 * The files the tests ran, from the coverage file of each workspace under packages/ and apps/; `missing`: the
 * workspaces that have none (their tests have not run with coverage since the folder was cleaned).
 * @param {string} root
 * @returns {{ files: Map<string, TestFile>; missing: string[] }}
 */
export function readTests(root) {
  /** @type {Map<string, TestFile>} */
  const files = new Map();
  /** @type {string[]} */
  const missing = [];
  for (const parent of WORKSPACE_PARENTS.filter((name) => existsSync(join(root, name)))) {
    const workspaces = readdirSync(join(root, parent), { withFileTypes: true }).filter((dir) =>
      dir.isDirectory(),
    );
    for (const workspace of workspaces.map((dir) => `${parent}/${dir.name}`)) {
      const path = join(root, workspace, TEST_COVERAGE);
      if (!existsSync(path)) missing.push(workspace);
      for (const file of existsSync(path) ? testFilesOf(root, path) : []) files.set(file.rel, file);
    }
  }
  return { files, missing };
}

/**
 * The files of a coverage-final.json whose source is still there.
 * @param {string} root
 * @param {string} path
 * @returns {TestFile[]}
 */
function testFilesOf(root, path) {
  /** @type {Record<string, FileCoverage>} */
  const data = JSON.parse(readFileSync(path, 'utf8'));
  return Object.values(data)
    .filter((entry) => existsSync(entry.path))
    .map((entry) => testFileOf(root, entry));
}

/**
 * The lines of `file` the tests ran and no run did, in order; all of them when no run loaded the file.
 * @param {TestFile} file
 * @param {Uint8Array | undefined} ran
 * @returns {number[]}
 */
export function unrunLines(file, ran) {
  const starts = [0];
  for (let at = file.text.indexOf('\n'); at !== -1; at = file.text.indexOf('\n', at + 1)) starts.push(at + 1);
  /** @param {number} line @param {number} column */
  const executed = (line, column) => ran?.[(starts[line - 1] ?? Number.NaN) + column] === 1;
  return [...file.lines]
    .filter(([line, columns]) => !columns.some((column) => executed(line, column)))
    .map(([line]) => line)
    .sort((a, b) => a - b);
}

/**
 * Lines as spans (`12-15, 20`): two lines not run join when no line the tests ran lies between them.
 * @param {readonly number[]} tested every line the tests ran in the file
 * @param {readonly number[]} unrun
 */
export function spansOf(tested, unrun) {
  const order = [...tested].sort((a, b) => a - b);
  const indexOf = new Map(order.map((line, index) => [line, index]));
  /** @type {[number, number][]} */
  const spans = [];
  for (const line of unrun) {
    const last = spans.at(-1);
    if (last !== undefined && indexOf.get(line) === (indexOf.get(last[1]) ?? Number.NaN) + 1) last[1] = line;
    else spans.push([line, line]);
  }
  return spans.map(([from, to]) => (from === to ? `${from}` : `${from}-${to}`)).join(', ');
}

/**
 * @param {Map<string, Row>} rows
 * @param {string} rel
 */
function rowOf(rows, rel) {
  const workspace = rel.split('/').slice(0, 2).join('/');
  const row = rows.get(workspace) ?? {
    workspace,
    tested: 0,
    unrun: 0,
    files: 0,
    unloaded: 0,
    differs: 0,
    details: [],
  };
  rows.set(workspace, row);
  return row;
}

/**
 * The report's rows, the workspace with the most lines not run first.
 * @param {ReadonlyMap<string, TestFile>} tests
 * @param {Runs} runs
 * @returns {Row[]}
 */
export function compare(tests, runs) {
  /** @type {Map<string, Row>} */
  const rows = new Map();
  for (const file of [...tests.values()].sort((a, b) => a.rel.localeCompare(b.rel))) {
    if (file.lines.size === 0) continue;
    const row = rowOf(rows, file.rel);
    if (runs.differs.has(file.rel)) {
      row.differs += 1;
      row.details.push(`- \`${file.rel}\`: the run's copy differs from the tests', not compared`);
      continue;
    }
    const ran = runs.ran.get(file.rel);
    const unrun = unrunLines(file, ran);
    row.files += 1;
    row.tested += file.lines.size;
    row.unrun += unrun.length;
    if (ran === undefined) row.unloaded += 1;
    const count = `${unrun.length} ${unrun.length === 1 ? 'line' : 'lines'}`;
    const where = ran === undefined ? `not loaded (${count})` : spansOf([...file.lines.keys()], unrun);
    if (unrun.length > 0) row.details.push(`- \`${file.rel}\`: ${where}`);
  }
  return [...rows.values()].sort((a, b) => b.unrun - a.unrun || a.workspace.localeCompare(b.workspace));
}

/** @param {number} part @param {number} whole */
const share = (part, whole) => (whole === 0 ? '-' : `${((PERCENT * part) / whole).toFixed(1)} %`);

/** @param {Pick<Row, 'tested' | 'unrun' | 'files' | 'unloaded' | 'differs'>} row @param {string} name */
const tableLine = (row, name) =>
  `| ${name} | ${row.tested} | ${row.unrun} | ${share(row.unrun, row.tested)} | ${row.unloaded} / ${row.files} | ${row.differs} |`;

/**
 * The report in Markdown: what was read, a table by workspace and, unless `summary`, the lines of each file.
 * @param {{ rows: readonly Row[]; dirs: readonly string[]; runs: Runs; missing: readonly string[]; summary: boolean }} input
 */
export function renderReport({ rows, dirs, runs, missing, summary }) {
  /** @param {'tested' | 'unrun' | 'files' | 'unloaded' | 'differs'} key */
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  const total = {
    tested: sum('tested'),
    unrun: sum('unrun'),
    files: sum('files'),
    unloaded: sum('unloaded'),
    differs: sum('differs'),
  };
  const head = [
    '# Lines the tests run that the runs did not',
    '',
    `Runs: ${dirs.map((dir) => `\`${dir}\``).join(', ')} (${runs.processes} coverage files, one per process).`,
    `Tests: \`${TEST_COVERAGE}\` of each workspace${missing.length === 0 ? '' : `; none for ${missing.join(', ')}`}.`,
    'A report, not a gate (plans/architecture-health.md K12).',
    '',
    '| Workspace | Lines the tests run | Not run | Share | Files not loaded / compared | Copy differs |',
    '|---|---:|---:|---:|---:|---:|',
    ...rows.map((row) => tableLine(row, row.workspace)),
    tableLine(total, '**all**'),
  ];
  const details = rows
    .filter((row) => row.details.length > 0)
    .flatMap((row) => ['', `## ${row.workspace}`, '', ...row.details]);
  return `${[...head, ...(summary ? [] : details)].join('\n')}\n`;
}

/**
 * @param {readonly string[]} argv
 * @returns {{ dirs: string[]; summary: boolean; out?: string } | string}
 */
export function parseArgs(argv) {
  /** @type {{ dirs: string[]; summary: boolean; out?: string }} */
  const args = { dirs: [], summary: false };
  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at];
    const value = argv[at + 1];
    if (arg === '--summary') args.summary = true;
    else if ((arg === '--run' || arg === '--out') && value !== undefined && !value.startsWith('--')) {
      if (arg === '--run') args.dirs.push(resolve(value));
      else args.out = resolve(value);
      at += 1;
    } else return `unknown or incomplete argument ${arg ?? ''}; ${USAGE}`;
  }
  return args.dirs.length === 0 ? USAGE : args;
}

/**
 * The report of the repo at `root` for the runs of `argv`.
 * @param {readonly string[]} argv
 * @param {string} root
 * @param {(line: string) => void} print
 * @returns {number} the exit code: 0 with a report, 1 when an input is missing, 2 on a bad argument
 */
export function main(argv, root, print) {
  const args = parseArgs(argv);
  if (typeof args === 'string') {
    print(args);
    return 2;
  }
  const tests = readTests(root);
  if (tests.files.size === 0) {
    print(`no ${TEST_COVERAGE} under packages/ or apps/: run pnpm test first, on the commit the runs ran`);
    return 1;
  }
  const absent = args.dirs.filter((dir) => !existsSync(dir));
  const runs = absent.length === 0 ? readRuns(args.dirs, tests.files) : undefined;
  if (runs === undefined || runs.processes === 0) {
    print(`no coverage-*.json in ${(absent.length === 0 ? args.dirs : absent).join(', ')}`);
    return 1;
  }
  const rows = compare(tests.files, runs);
  const report = renderReport({ rows, dirs: args.dirs, runs, missing: tests.missing, summary: args.summary });
  if (args.out === undefined) print(report);
  else {
    writeFileSync(args.out, report);
    print(`wrote ${args.out}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = main(process.argv.slice(2), resolve(import.meta.dirname, '..'), (line) => {
    console.log(line);
  });
