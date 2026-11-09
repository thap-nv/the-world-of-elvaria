// What the repo's Claude Code hooks share (implementation-plan §5.1): the checkout they guard, the stdin payload,
// and running the repo's own tools. A tool runs as `node <its bin script>`: never through a shell (ADR 0015) and
// never through `pnpm`, which on Windows is a .cmd shim that spawn cannot start without one; with only the env
// it needs, never process.env whole (CLAUDE.md, ADR 0013).
import { spawnSync } from 'node:child_process';
import { readFileSync, readSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';

/** The checkout: `.claude/hooks/` sits two levels under it, in a git worktree too. */
export const REPO = resolve(import.meta.dirname, '../..');

/** What node, tsc, dependency-cruiser and git read from the environment (`Path` is Windows' spelling). */
const TOOL_ENV = [
  'PATH',
  'Path',
  'SystemRoot',
  'HOME',
  'USERPROFILE',
  'TEMP',
  'TMP',
  'APPDATA',
  'LOCALAPPDATA',
];
/** tsc and dependency-cruiser print every error; their output is cut by the hooks, not by spawn. */
const MAX_OUTPUT = 16 * 1024 * 1024;

/** @typedef {{ read: (buffer: Buffer) => number; wait: (ms: number) => void }} StdinSource */

const pause = new Int32Array(new SharedArrayBuffer(4));

/** fd 0: `read` returns 0 at the end and throws EAGAIN when a non-blocking pipe is empty. @type {StdinSource} */
export const FD_0 = {
  read: (buffer) => readSync(0, buffer, 0, buffer.length, null),
  wait: (ms) => {
    Atomics.wait(pause, 0, 0, ms);
  },
};

/**
 * Everything on stdin, read as packages/hooks/src/stdin.ts reads it (P1-36). `readFileSync(0)` throws away what it
 * had read when a read fails with EAGAIN (a pipe left non-blocking whose writer has not closed it yet); this loop
 * keeps every chunk and, on EAGAIN, waits a millisecond and reads on.
 * @param {StdinSource} source
 */
export function readStdin(source = FD_0) {
  /** @type {Buffer[]} */
  const chunks = [];
  const buffer = Buffer.alloc(64 * 1024);
  for (;;) {
    /** @type {number} */
    let count;
    try {
      count = source.read(buffer);
    } catch (error) {
      if (/** @type {{ code?: unknown } | null} */ (error)?.code !== 'EAGAIN') throw error;
      source.wait(1);
      continue;
    }
    if (count === 0) return Buffer.concat(chunks).toString('utf8');
    chunks.push(Buffer.from(buffer.subarray(0, count)));
  }
}

/**
 * The hook payload Claude Code writes on stdin; an empty object when there is none or it is not JSON.
 * @param {() => string} read
 * @returns {Record<string, unknown>}
 */
export function readPayload(read = () => readStdin()) {
  try {
    const value = /** @type {unknown} */ (JSON.parse(read()));
    const isObject = typeof value === 'object' && value !== null && !Array.isArray(value);
    return isObject ? /** @type {Record<string, unknown>} */ (value) : {};
  } catch {
    return {};
  }
}

/**
 * A string field of the payload's `tool_input`, or '' when absent.
 * @param {Record<string, unknown>} payload
 * @param {string} name
 */
export function toolInput(payload, name) {
  const input = payload.tool_input;
  if (typeof input !== 'object' || input === null) return '';
  const value = /** @type {Record<string, unknown>} */ (input)[name];
  return typeof value === 'string' ? value : '';
}

/**
 * Repo-relative path with `/` of a file the agent named, or undefined when it lies outside the checkout.
 * @param {string} file
 * @param {string} repo
 */
export function repoPath(file, repo = REPO) {
  if (file === '') return undefined;
  const rel = relative(repo, resolve(repo, file)).replaceAll('\\', '/');
  return rel === '' || rel.startsWith('../') || rel === '..' || /^[a-zA-Z]:/.test(rel) ? undefined : rel;
}

/** @param {NodeJS.ProcessEnv} env */
export function toolEnv(env = process.env) {
  return Object.fromEntries(TOOL_ENV.flatMap((key) => (env[key] === undefined ? [] : [[key, env[key]]])));
}

/**
 * The script a dependency of the repo root names in its `bin`, e.g. `binOf('typescript', 'tsc')`.
 * @param {string} name
 * @param {string} bin
 */
export function binOf(name, bin) {
  const dir = join(REPO, 'node_modules', name);
  const manifest = /** @type {{ bin?: string | Record<string, string> }} */ (
    JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  );
  const entry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[bin];
  if (entry === undefined) throw new Error(`${name} has no bin "${bin}"`);
  return join(dir, entry);
}

/**
 * Runs `node <script> ...args` in the checkout. `ok` is false only for a finished run that failed: a tool that
 * cannot start or times out is not the agent's mistake, so callers let the agent go on.
 * @param {string} script
 * @param {readonly string[]} args
 * @param {number} timeoutMs
 */
export function runNode(script, args, timeoutMs) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: REPO,
    env: toolEnv(),
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: MAX_OUTPUT,
    shell: false,
  });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  return { ok: result.status === 0 || result.error !== undefined || result.status === null, output };
}

/**
 * git in the checkout, without the caller's GIT_* variables (implementation-plan §6, the P0-08 lesson); '' on
 * failure.
 * @param {readonly string[]} args
 */
export function git(args) {
  const result = spawnSync('git', [...args], {
    cwd: REPO,
    env: toolEnv(),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT,
    shell: false,
  });
  return result.status === 0 ? result.stdout : '';
}
