// Plumbing shared by the catalog scripts (ADR 0017, implementation-plan §3.12). A kingdom copies these files to
// registry/scripts/, and the Steward runs `node registry/scripts/<id>.mjs --params <json> [--context <json>]`
// with the quest's plot as working directory. The kingdom has no node_modules, so: Node built-ins only.
import { globSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * 0: the result is on stdout, a failing check included. 1: the script itself broke (the quest goes to the
 * infirmary). 2: params or context it cannot work with (a bad quest, not a crash).
 */
export const EXIT = Object.freeze({ ok: 0, broken: 1, usage: 2 });

/** Params or context the script cannot use; ends the run with EXIT.usage. */
export class UsageError extends Error {}

/** @typedef {Record<string, unknown>} Json */
/** @typedef {(params: Json, context: Json, cwd: string) => unknown} ScriptBody */

/** @param {unknown} value @returns {value is Json} */
export const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * `--params` comes from the quest (checked against the catalog's params_schema); `--context` carries what the
 * Steward knows at run time and the quest must not choose, such as the territory's check commands.
 * @param {readonly string[]} argv
 * @returns {{ params: Json; context: Json }}
 */
export function readArgs(argv) {
  /** @param {string} flag @returns {Json} */
  const read = (flag) => {
    const index = argv.indexOf(flag);
    if (index === -1) return {};
    const raw = argv[index + 1];
    if (raw === undefined) throw new UsageError(`${flag} needs a JSON object`);
    /** @type {unknown} */
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new UsageError(`${flag} is not valid JSON`);
    }
    if (!isObject(value)) throw new UsageError(`${flag} must be a JSON object`);
    return value;
  };
  return { params: read('--params'), context: read('--context') };
}

/**
 * Runs a script body and turns its outcome into the process contract: one JSON line on stdout and an exit code.
 * @param {ScriptBody} body
 * @param {readonly string[]} argv
 * @param {string} cwd
 * @returns {Promise<{ code: number; stdout: string; stderr: string }>}
 */
export async function execute(body, argv, cwd) {
  try {
    const { params, context } = readArgs(argv);
    const result = await body(params, context, cwd);
    return { code: EXIT.ok, stdout: `${JSON.stringify(result)}\n`, stderr: '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      code: error instanceof UsageError ? EXIT.usage : EXIT.broken,
      stdout: '',
      stderr: `${message}\n`,
    };
  }
}

/** Entry point of a script run as a process. @param {ScriptBody} body */
export async function cli(body) {
  const { code, stdout, stderr } = await execute(body, process.argv.slice(2), process.cwd());
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = code;
}

/** @param {Json} params @param {string} key @returns {string[]} */
export function stringList(params, key) {
  const value = params[key];
  const valid =
    Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item);
  if (!valid) throw new UsageError(`params.${key} must be a non-empty list of strings`);
  return /** @type {string[]} */ (value);
}

/** @param {Json} params @param {string} key @param {string} [fallback] @returns {string} */
export function text(params, key, fallback) {
  const value = params[key] ?? fallback;
  if (typeof value !== 'string' || value === '')
    throw new UsageError(`params.${key} must be a non-empty string`);
  return value;
}

/** @param {string} file @returns {string} */
export const toPortable = (file) => file.split(path.sep).join('/');

/**
 * Resolves a path from params inside the plot. Params are written by a model, so a path may not leave the plot.
 * @param {string} cwd @param {string} relative @returns {string}
 */
export function insidePlot(cwd, relative) {
  const resolved = path.resolve(cwd, relative);
  const back = path.relative(cwd, resolved);
  if (path.isAbsolute(relative) || back === '..' || back.startsWith(`..${path.sep}`)) {
    throw new UsageError(`path "${relative}" must stay inside the plot`);
  }
  return resolved;
}

/**
 * Files matching `globs` inside the plot, as sorted `/` paths. node_modules is never walked.
 * @param {string} cwd @param {readonly string[]} globs @returns {string[]}
 */
export function globFiles(cwd, globs) {
  for (const glob of globs) {
    if (path.isAbsolute(glob) || glob.split(/[\\/]/).includes('..')) {
      throw new UsageError(`glob "${glob}" must stay inside the plot`);
    }
  }
  const entries = globSync([...globs], {
    cwd,
    withFileTypes: true,
    exclude: (entry) => entry.name === 'node_modules',
  });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => toPortable(path.relative(cwd, path.join(entry.parentPath, entry.name))));
  return [...new Set(files)].sort();
}

/**
 * Environment for a child process: what toolchains need to start, nothing else. The Steward already starts
 * scripts with a minimal env (ADR 0013); this keeps a script from widening it.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Record<string, string>}
 */
export function childEnv(env = process.env) {
  // process.env ignores case on Windows, so `PATH` also finds `Path` there.
  const keys = [
    'PATH',
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'SystemRoot',
    'TEMP',
    'TMP',
    'TMPDIR',
  ];
  /** @type {Record<string, string>} */
  const picked = {};
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined) picked[key] = value;
  }
  return picked;
}
