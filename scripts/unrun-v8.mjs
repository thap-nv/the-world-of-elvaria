// The run side of `pnpm coverage:unrun` (unrun-lines.mjs; AH-15, plans/architecture-health.md V15, K12): which
// characters of each source file a real run executed, from the raw coverage Node writes into NODE_V8_COVERAGE.
//
// Node runs the repo's `.ts` by type stripping, which blanks the types in place: V8's offsets are offsets into the
// file on disk, so no source map is needed (Node appends a `//# sourceURL=` line past the file's end, cut off here).
// Node also hands NODE_V8_COVERAGE to every child process, even one spawned with an explicit env (ADR 0013): the fake
// CLIs, the hooks and the Steward's checks write files of their own. Only scripts whose path ends in a source file
// the tests know are kept, so built bundles (`dist/`), fixtures and node_modules drop out. On a kingdom day the
// checks of the `elvaria` territory run its tests in a quest's plot: plots drop out, and so does any module V8 ran
// in another shape than the file on disk (vitest's transform), which a test runner did, not the run.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {{ startOffset: number; endOffset: number; count: number }} V8Range */
/** @typedef {{ url: string; functions: readonly { ranges: readonly V8Range[] }[] }} V8Script */
/**
 * What the runs did. `ran`: by repo-relative path, one flag per character of the file, 1 where any process ran it.
 * `differs`: files whose run copy is not the tests' copy (a pinned build of another commit, a file since edited),
 * which cannot be compared line by line. `processes`: coverage files read, one per process.
 * @typedef {{ ran: Map<string, Uint8Array>; differs: Set<string>; processes: number }} Runs
 */

/** The file name Node gives each process's coverage. */
const COVERAGE_FILE = /^coverage-.*\.json$/;
const WORKSPACE = /\/(?:packages|apps)\//g;
/** Installs, and the plots of quests (`worktree_dir` of a territory, default `.elvaria/worktrees`, ADR 0012). */
const NOT_RUN_CODE = ['/node_modules/', '/.elvaria/worktrees/'];
/** What type stripping appends to a `.ts` before V8 compiles it, followed by the script's URL. */
const SOURCE_URL = '\n\n//# sourceURL=';

/**
 * The repo-relative path of a script, wherever the run's copy lives (this checkout, a kingdom's `.builds/<sha>/`):
 * the first `packages/…` or `apps/…` tail of its path that `known` holds; with it, the copy's native path.
 * @param {string} url
 * @param {ReadonlyMap<string, unknown>} known
 * @returns {{ rel: string; file: string } | undefined}
 */
export function relativeOf(url, known) {
  if (!url.startsWith('file:')) return undefined;
  const file = fileURLToPath(url);
  const slashed = file.replaceAll('\\', '/');
  if (NOT_RUN_CODE.some((part) => slashed.includes(part))) return undefined;
  for (const match of slashed.matchAll(WORKSPACE)) {
    const rel = slashed.slice(match.index + 1);
    if (known.has(rel)) return { rel, file };
  }
  return undefined;
}

/**
 * Flags in `ran` the characters `script` executed. V8 nests a function's block ranges inside it and the innermost
 * count is the one that holds, so ranges are painted from the longest to the shortest, then merged with what other
 * processes ran.
 * @param {V8Script} script
 * @param {Uint8Array} ran
 */
export function paint(script, ran) {
  const local = new Uint8Array(ran.length);
  const ranges = script.functions.flatMap((fn) => fn.ranges);
  ranges.sort((a, b) => b.endOffset - b.startOffset - (a.endOffset - a.startOffset));
  for (const range of ranges) local.fill(range.count > 0 ? 1 : 0, range.startOffset, range.endOffset);
  for (let at = 0; at < ran.length; at += 1) if (local[at] === 1) ran[at] = 1;
}

/**
 * The scripts of one coverage file; none when it is not one Node wrote.
 * @param {string} path
 * @returns {readonly V8Script[]}
 */
function scriptsOf(path) {
  /** @type {unknown} */
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const result = typeof data === 'object' && data !== null && 'result' in data ? data.result : undefined;
  return Array.isArray(result) ? result : [];
}

/**
 * Every script of the source the tests know, from each NODE_V8_COVERAGE folder, merged: a character ran when any
 * process ran it.
 * @param {readonly string[]} dirs
 * @param {ReadonlyMap<string, { text: string }>} tests the tests' copy of each repo-relative file
 * @returns {Runs}
 */
export function readRuns(dirs, tests) {
  /** @type {Runs} */
  const runs = { ran: new Map(), differs: new Set(), processes: 0 };
  /** @type {Map<string, string | undefined>} */
  const copies = new Map();
  /** @param {string} file */
  const copyOf = (file) => {
    if (!copies.has(file)) copies.set(file, readCopy(file));
    return copies.get(file);
  };
  for (const dir of dirs) {
    for (const name of readdirSync(dir).filter((entry) => COVERAGE_FILE.test(entry))) {
      runs.processes += 1;
      for (const script of scriptsOf(join(dir, name))) addScript(runs, script, tests, copyOf);
    }
  }
  return runs;
}

/**
 * @param {Runs} runs
 * @param {V8Script} script
 * @param {ReadonlyMap<string, { text: string }>} tests
 * @param {(file: string) => string | undefined} copyOf
 */
function addScript(runs, script, tests, copyOf) {
  const found = relativeOf(script.url, tests);
  const text = found === undefined ? undefined : tests.get(found.rel)?.text;
  if (found === undefined || text === undefined) return;
  const copy = copyOf(found.file);
  if (copy !== undefined && !asOnDisk(script, copy)) return;
  if (copy !== text) {
    runs.differs.add(found.rel);
    return;
  }
  const ran = runs.ran.get(found.rel) ?? new Uint8Array(text.length);
  paint(script, ran);
  runs.ran.set(found.rel, ran);
}

/**
 * Whether V8 ran `copy` as Node loads it from disk: the script's top-level range is the file, plus the URL line
 * type stripping appends to a `.ts`. A module a test runner transformed first has another length.
 * @param {V8Script} script
 * @param {string} copy
 */
function asOnDisk(script, copy) {
  const length = script.functions[0]?.ranges[0]?.endOffset;
  return length === copy.length || length === copy.length + SOURCE_URL.length + script.url.length;
}

/**
 * The run's copy of a file, gone when the build it ran from was removed.
 * @param {string} file
 */
function readCopy(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}
