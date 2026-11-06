// Throwaway plots for the script tests: a temp folder holding the given files, and a way to run a script in it
// as the Steward will, as a separate process.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPTS = fileURLToPath(new URL('.', import.meta.url));

export interface Plot {
  readonly dir: string;
  write(file: string, content: string | Uint8Array): void;
  remove(): void;
}

export function makePlot(files: Readonly<Record<string, string>> = {}): Plot {
  const dir = mkdtempSync(path.join(tmpdir(), 'elvaria-plot-'));
  const write = (file: string, content: string | Uint8Array) => {
    const target = path.join(dir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  for (const [file, content] of Object.entries(files)) write(file, content);
  const remove = () => {
    rmSync(dir, { recursive: true, force: true });
  };
  return { dir, write, remove };
}

/** Only what node and git need, never process.env wholesale (CLAUDE.md). */
export function minimalEnv(): Record<string, string> {
  const keys = ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'TEMP', 'TMP'];
  return Object.fromEntries(keys.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])));
}

/** `node scripts/<script> ...args` in `cwd`: the process contract the Steward relies on. */
export function runScript(script: string, args: readonly string[], cwd: string) {
  const result = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    cwd,
    env: minimalEnv(),
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
