// The spawn probe of the conformance suite (`spawn_child`, P1-12e): a script the session's shell runs in its plot,
// which starts a child process with piped stdio, as a territory's build and test do (Vitest, esbuild, `pnpm -r`,
// `spawnSync git`). Codex 0.167's unelevated Windows sandbox let the command run but refused its piped child
// (`Error: spawn EPERM`), so a knight edited code it could neither build nor test, and no check caught it.
import { execFile, spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/** The script the probe runs, written at the root of the plot. */
export const SPAWN_PROBE_FILE = 'elvaria-spawn-probe.mjs';
/** What the session is asked to run: no quotes, so it reads the same in bash, PowerShell and cmd. */
export const SPAWN_PROBE_COMMAND = `node ${SPAWN_PROBE_FILE}`;
/** Where the script writes what became of its child, next to itself. */
export const SPAWN_PROBE_OUT = 'elvaria-spawn-probe.txt';
/** What the child prints, and so what the file holds when the child ran. */
export const SPAWN_PROBE_OK = 'child ran';
/** The file's start when the child could not start; the error's code follows (`EPERM`). */
export const SPAWN_PROBE_FAILED = 'child failed: ';

/** The script: execFileSync pipes the child's stdout, the case a sandbox may refuse while it lets the command run. */
export const SPAWN_PROBE_SCRIPT = [
  "// Elvaria's conformance suite (spawn_child): can a command of this session start a child process?",
  "import { execFileSync } from 'node:child_process';",
  "import { writeFileSync } from 'node:fs';",
  '',
  'let outcome;',
  'try {',
  `  outcome = execFileSync(process.execPath, ['-e', ${JSON.stringify(`process.stdout.write(${JSON.stringify(SPAWN_PROBE_OK)})`)}], { encoding: 'utf8' });`,
  '} catch (error) {',
  `  outcome = ${JSON.stringify(SPAWN_PROBE_FAILED)} + (error.code ?? error.message);`,
  '}',
  `writeFileSync(new URL(${JSON.stringify(`./${SPAWN_PROBE_OUT}`)}, import.meta.url), outcome);`,
  'console.log(outcome);',
  '',
].join('\n');

/** Puts the script at the root of `plot`, before the session starts. */
export const writeSpawnProbe = (plot: string): Promise<void> =>
  writeFile(path.join(plot, SPAWN_PROBE_FILE), SPAWN_PROBE_SCRIPT, 'utf8');

/** What the script left in `plot`; undefined when it never ran (or could not write there). */
export async function readSpawnProbe(plot: string): Promise<string | undefined> {
  try {
    return (await readFile(path.join(plot, SPAWN_PROBE_OUT), 'utf8')).trim();
  } catch {
    return undefined;
  }
}

/**
 * What a fake CLI's shell does with a line its gates let through: the spawn probe runs for real, with this Node, so a
 * fake session shows what this machine allows; every other line only seems to run.
 */
export function runFakeShellLine(command: string, cwd: string): void {
  if (command !== SPAWN_PROBE_COMMAND) return;
  spawnSync(process.execPath, [SPAWN_PROBE_FILE], { cwd, stdio: 'ignore', windowsHide: true });
}

/** The probe run by FakeRunner, in process: the same script, without holding the event loop. */
export function runSpawnProbe(cwd: string): Promise<void> {
  return new Promise((resolve) => {
    execFile(process.execPath, [SPAWN_PROBE_FILE], { cwd, windowsHide: true }, () => {
      resolve();
    });
  });
}
