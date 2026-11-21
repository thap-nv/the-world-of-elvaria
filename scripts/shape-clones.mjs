// `pnpm dup` (AH-13; plans/architecture-health.md V13, K8, K13): the shape clones of shape-detect.mjs over the
// runtime code of every workspace under packages/ and apps/, as a gate against shape-clones.json.
//
//   pnpm dup           red on a file pair of MIN_TOKENS or more the list does not hold, on a listed pair that grew,
//                      and on a listed pair that shrank or went (left for --prune)
//   pnpm dup --prune   lower shape-clones.json to today: drop pairs fixed, lower counts; never adds or raises
//   pnpm dup --stats   also print how much of the code sits in a clone, the measure AH-14 lowers
//
// A listed pair is `unreviewed` (the pairs of the day the gate came in, which AH-14 works through) or `kept` with
// a reason. A new pair is moved to a common home (§4.2 R7), or listed as kept with its reason; shape-clones.spec.ts
// fails a branch that adds or raises an unreviewed pair, so the list of pairs nobody looked at only shrinks.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { shapeClones } from './shape-detect.mjs';

export const LIST_FILE = 'shape-clones.json';
/** About 8 lines of code: the size below which two shapes are too common to call a copy (K13, tried in AH-13). */
export const MIN_TOKENS = 60;

const WORKSPACE_PARENTS = ['packages', 'apps'];
// Build output and installs are not source; test helpers and fixture trees repeat by nature, as specs do.
const SKIPPED = new Set(['node_modules', 'dist', 'coverage', '.turbo', '__fixtures__', 'fixtures', 'test']);
const RUNTIME = /\.(?:ts|mjs)$/;
const SPEC = /\.(?:spec|test)\.[^.]+$/;
// a tool's config (vitest.config.ts) is written once per package by nature, like a barrel
const CONFIG = /\.config\.[^.]+$/;
const STATUSES = ['unreviewed', 'kept'];

/** @typedef {import('./shape-detect.mjs').ClonePair} ClonePair */
/** @typedef {{ a: string; b: string; tokens: number; status: 'unreviewed' | 'kept'; reason?: string }} ListedPair */
/** @typedef {{ version: 1; pairs: ListedPair[] }} CloneList */

/** @param {string} name */
const isRuntime = (name) =>
  RUNTIME.test(name) && !SPEC.test(name) && !CONFIG.test(name) && name !== 'index.ts';

/** @param {{ a: string; b: string }} pair */
const keyOf = (pair) => `${pair.a} ~ ${pair.b}`;

/**
 * Every runtime file of every workspace: `.ts` and `.mjs` that is not a spec, a barrel, a tool config or a test
 * helper.
 * @param {string} root
 * @returns {import('./shape-detect.mjs').SourceFile[]}
 */
export function runtimeSources(root) {
  /** @type {import('./shape-detect.mjs').SourceFile[]} */
  const out = [];
  /** @param {string} rel */
  const walk = (rel) => {
    for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
      if (SKIPPED.has(entry.name)) continue;
      const path = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (isRuntime(entry.name)) out.push({ path, text: readFileSync(join(root, path), 'utf8') });
    }
  };
  for (const parent of WORKSPACE_PARENTS) if (existsSync(join(root, parent))) walk(parent);
  return out;
}

/**
 * The list in `text`. A wrong version, status or shape, a kept pair without a reason, or a pair twice is an
 * error, not an empty list.
 * @param {string} text
 * @returns {CloneList}
 */
export function parseList(text) {
  /** @type {{ version?: unknown; pairs?: unknown }} */
  const raw = JSON.parse(text);
  if (raw.version !== 1) throw new Error(`${LIST_FILE}: version must be 1`);
  if (!Array.isArray(raw.pairs)) throw new Error(`${LIST_FILE}: pairs must be a list`);
  /** @type {ListedPair[]} */
  const pairs = raw.pairs;
  const seen = new Set();
  for (const pair of pairs) {
    const where = `${LIST_FILE}: ${keyOf(pair)}`;
    if (typeof pair.a !== 'string' || typeof pair.b !== 'string' || !(pair.a < pair.b))
      throw new Error(`${where}: a and b are two paths, a before b`);
    if (!Number.isInteger(pair.tokens) || pair.tokens < 1)
      throw new Error(`${where}: tokens must be a count`);
    if (!STATUSES.includes(pair.status)) throw new Error(`${where}: status must be ${STATUSES.join(' or ')}`);
    if (pair.status === 'kept' && !pair.reason?.trim())
      throw new Error(`${where}: a kept pair needs a reason`);
    if (seen.has(keyOf(pair))) throw new Error(`${where}: listed twice`);
    seen.add(keyOf(pair));
  }
  return { version: 1, pairs };
}

/**
 * What the list does not cover (a new pair, or a listed one grown), and what it holds above today (a pair fixed
 * or shrunk, left for --prune). `today` holds the pairs of MIN_TOKENS or more only.
 * @param {CloneList} list
 * @param {readonly ClonePair[]} today
 * @returns {{ added: string[]; stale: string[] }}
 */
export function compareClones(list, today) {
  const listed = new Map(list.pairs.map((pair) => [keyOf(pair), pair]));
  const now = new Map(today.map((pair) => [keyOf(pair), pair]));
  const added = today.flatMap((pair) => {
    const allowed = listed.get(keyOf(pair))?.tokens;
    const where = `${pair.a}:${pair.linesA} ~ ${pair.b}:${pair.linesB}`;
    if (allowed === undefined) return [`${pair.tokens} tokens ${where}`];
    return pair.tokens > allowed ? [`grew ${allowed} → ${pair.tokens} tokens ${where}`] : [];
  });
  const stale = list.pairs.flatMap((pair) => {
    const tokens = now.get(keyOf(pair))?.tokens ?? 0;
    return tokens < pair.tokens ? [`${keyOf(pair)}: ${pair.tokens} → ${tokens}`] : [];
  });
  return { added, stale };
}

/**
 * The list lowered to today: pairs fixed leave, counts drop, status and reason stay; nothing new comes in.
 * @param {CloneList} list
 * @param {readonly ClonePair[]} today
 * @returns {CloneList}
 */
export function pruneList(list, today) {
  const now = new Map(today.map((pair) => [keyOf(pair), pair.tokens]));
  const pairs = list.pairs.flatMap((pair) => {
    const tokens = Math.min(pair.tokens, now.get(keyOf(pair)) ?? 0);
    return tokens > 0 ? [{ ...pair, tokens }] : [];
  });
  return { version: 1, pairs };
}

/**
 * The unreviewed pairs `head` holds above `base`: one `base` did not hold, or one raised. Empty when the list of
 * pairs nobody looked at only shrank; a kept pair is a decision with its reason, so it may come in or grow.
 * @param {CloneList} base
 * @param {CloneList} head
 */
export function listGrowth(base, head) {
  const before = new Map(base.pairs.map((pair) => [keyOf(pair), pair]));
  return head.pairs.flatMap((pair) => {
    const old = before.get(keyOf(pair));
    if (pair.status !== 'unreviewed') return [];
    if (old === undefined || old.status !== 'unreviewed') return [`new unreviewed ${keyOf(pair)}`];
    return pair.tokens > old.tokens ? [`unreviewed ${keyOf(pair)}: ${old.tokens} → ${pair.tokens}`] : [];
  });
}

/**
 * The shares of the code in a clone, as `--stats` prints them.
 * @param {ReturnType<typeof shapeClones>} found
 */
function statsOf(found) {
  const share = found.tokens === 0 ? 0 : (100 * found.cloned) / found.tokens;
  /** @param {number} min */
  const at = (min) => found.pairs.filter((pair) => pair.tokens >= min).length;
  return [
    `files ${found.files}, tokens ${found.tokens}, in a clone ${found.cloned} (${share.toFixed(2)} %)`,
    `file pairs ${found.pairs.length}; from 60 tokens ${at(60)}, from 100 ${at(100)}, from 200 ${at(200)}`,
  ];
}

/**
 * Check, or with --prune lower, the list of the repo at `root`.
 * @param {readonly string[]} argv
 * @param {string} root
 * @param {(line: string) => void} print
 * @returns {number} the exit code
 */
export function main(argv, root, print) {
  const prune = argv.includes('--prune');
  const unknown = argv.filter((arg) => arg !== '--prune' && arg !== '--stats');
  if (unknown.length > 0) {
    print(`unknown argument ${unknown.join(' ')}; usage: dup [--prune] [--stats]`);
    return 2;
  }
  const path = join(root, LIST_FILE);
  /** @type {CloneList} */
  const list = existsSync(path) ? parseList(readFileSync(path, 'utf8')) : { version: 1, pairs: [] };
  const found = shapeClones(runtimeSources(root));
  const today = found.pairs.filter((pair) => pair.tokens >= MIN_TOKENS);
  const { added, stale } = compareClones(list, today);
  if (prune && stale.length > 0) writeFileSync(path, `${JSON.stringify(pruneList(list, today), null, 2)}\n`);
  if (argv.includes('--stats')) for (const line of statsOf(found)) print(line);
  for (const line of added) print(`new: ${line}`);
  if (!prune) for (const line of stale) print(`fixed, run pnpm dup --prune: ${line}`);
  if (added.length > 0)
    print(
      `Move the shared shape to a common home (implementation-plan §4.2, R7), or list the pair in ${LIST_FILE} as kept with a reason.`,
    );
  return added.length > 0 || (!prune && stale.length > 0) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = main(process.argv.slice(2), resolve(import.meta.dirname, '..'), (line) => {
    console.log(line);
  });
