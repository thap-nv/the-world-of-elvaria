// The env every child process starts from (implementation-plan §3.9, ADR 0013): what a toolchain needs to start
// and to find the owner's own sign-in, never process.env whole. The composition root builds it once from its own
// env; a session adds `ELVARIA_*` and the secrets its quest asks for (session-env.ts).

/**
 * The names passed on. `TMPDIR` is the temp folder of macOS (TEMP and TMP are Windows'); the CLIs of stage 1
 * find their sign-in through the home folder (Claude Code, Antigravity), so no CLI variable is needed yet.
 */
export const MINIMAL_ENV_NAMES = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
  'TMPDIR',
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
  'LANG',
] as const;

/**
 * The value of `name`, asked without case when the exact name is missing: Windows names are case-insensitive,
 * and a copy of its env keeps the spelling it was set with (`Path`), which `source.PATH` would miss.
 */
function valueOf(source: Readonly<Record<string, string | undefined>>, name: string): string | undefined {
  const exact = source[name];
  if (exact !== undefined) return exact;
  const lower = name.toLowerCase();
  const key = Object.keys(source).find((candidate) => candidate.toLowerCase() === lower);
  return key === undefined ? undefined : source[key];
}

/** The allowlisted variables of `source`, under their canonical names (one `PATH`, never `Path` too). */
export function minimalEnv(source: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(
    MINIMAL_ENV_NAMES.flatMap((name) => {
      const value = valueOf(source, name);
      return value === undefined ? [] : [[name, value]];
    }),
  );
}
