// What the hook remembers between calls of one run lives in `.runs/<quest>-<n>/hook/` (§2.2): small JSON files,
// one per concern, so calls that run at the same time (parallel tool calls, parallel apprentices) never
// rewrite each other's file. Every file has a `version` (CLAUDE.md, "Dữ liệu có schema").
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const RUN_STATE_VERSION = 1;

/** Native path of `<runDir>/hook/<name>`; `name` may hold `/`. */
export const stateFile = (runDir: string, name: string): string =>
  path.join(runDir, 'hook', ...name.split('/'));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The object in a state file of the current version; undefined when the file is missing or unreadable. */
export function readState(file: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return isRecord(value) && value.version === RUN_STATE_VERSION ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Writes a state file, creating its folder. With `once`, an existing file is kept and false is returned: the
 * first writer wins without a lock, because the file is created exclusively.
 */
export function writeState(file: string, value: Record<string, unknown>, once = false): boolean {
  mkdirSync(path.dirname(file), { recursive: true });
  try {
    writeFileSync(file, `${JSON.stringify({ version: RUN_STATE_VERSION, ...value })}\n`, {
      flag: once ? 'wx' : 'w',
    });
    return true;
  } catch (error) {
    if (once && error instanceof Error && 'code' in error && error.code === 'EEXIST') return false;
    throw error;
  }
}

export const removeState = (file: string): void => {
  rmSync(file, { force: true });
};
