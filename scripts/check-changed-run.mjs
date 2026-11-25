// How `pnpm check:changed` runs its checks (check-changed.mjs): pnpm without a shell, one command after another,
// each with only the variables the tools read.
import { spawnSync } from 'node:child_process';
import process from 'node:process';

/** @typedef {string[]} Command  the root script or tool and its arguments, as typed after `pnpm` */

/** Only what git, node and pnpm read from the environment; never process.env whole (CLAUDE.md, ADR 0013). */
const ENV_KEYS = [
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'ComSpec',
  'HOME',
  'USERPROFILE',
  'TEMP',
  'TMP',
  'TMPDIR',
  'APPDATA',
  'LOCALAPPDATA',
  'PNPM_HOME',
  'COREPACK_HOME',
  'CI',
];

/** @param {NodeJS.ProcessEnv} env */
export function toolEnv(env = process.env) {
  return Object.fromEntries(ENV_KEYS.flatMap((key) => (env[key] ? [[key, env[key]]] : [])));
}

/**
 * How to start `pnpm <command>` without a shell: pnpm is a `.cmd` shim on Windows, which spawn cannot start, so run
 * pnpm's own script with node when `pnpm run` told us where it is (`npm_execpath`).
 * @param {readonly string[]} command
 * @param {NodeJS.ProcessEnv} env
 * @param {string} platform
 * @returns {{ file: string; args: string[] } | { error: string }}
 */
export function pnpmInvocation(command, env, platform) {
  const script = env.npm_execpath;
  if (script && /\.[cm]?js$/.test(script)) return { file: process.execPath, args: [script, ...command] };
  if (script) return { file: script, args: [...command] };
  if (platform === 'win32')
    return { error: 'run it as `pnpm check:changed` (pnpm is a .cmd shim on Windows and no shell is used)' };
  return { file: 'pnpm', args: [...command] };
}

/** @param {Command[]} commands @param {string} cwd @param {(line: string) => void} out @param {boolean} narrow */
export function runCommands(commands, cwd, out, narrow) {
  for (const command of commands) {
    const start = pnpmInvocation(command, process.env, process.platform);
    if ('error' in start) {
      out(start.error);
      return 2;
    }
    out(`\n> pnpm ${command.join(' ')}`);
    const run = spawnSync(start.file, start.args, { cwd, env: toolEnv(), stdio: 'inherit', shell: false });
    if (run.status !== 0) {
      out(
        `pnpm ${command.join(' ')} failed (${run.error?.message ?? `exit ${run.status}`}); the checks after it did not run`,
      );
      return narrow ? 1 : (run.status ?? 1);
    }
  }
  out('\nchanged-file checks passed; `pnpm check` is still the gate before a merge');
  return 0;
}
