// A child process never inherits process.env whole (ADR 0013, CLAUDE.md): it gets what a toolchain needs to start
// and find its own settings, the same allowlist runner-core uses for sessions (implementation-plan §3.9).
import type { Env } from '../io.ts';

const PASSED = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
  'LANG',
] as const;

export function minimalEnv(env: Env): Record<string, string> {
  return Object.fromEntries(
    PASSED.flatMap((name) => {
      const value = env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
}
