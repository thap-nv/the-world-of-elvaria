// The territory laws the PreToolUse hook enforces: the second fence after the CLI's deny rules
// (implementation-plan §3.6, §3.9; ADR 0013). Deny rules are a fence, not a sandbox, so this one errs on the
// side of blocking: a forbidden path matches at any depth, in any case, under any spelling Windows accepts.
import { globToRegExp } from './glob.ts';

export interface LawsInput {
  readonly forbidden_paths?: readonly string[];
  readonly forbidden_commands?: readonly string[];
}

export interface CompiledLaws {
  readonly paths: readonly { readonly glob: string; readonly regex: RegExp }[];
  readonly commands: readonly { readonly source: string; readonly regex: RegExp }[];
  /** Why the laws could not be loaded; then every guarded call is blocked (fail closed). */
  readonly broken: string | undefined;
}

export const NO_LAWS: CompiledLaws = { paths: [], commands: [], broken: undefined };

export const brokenLaws = (problem: string): CompiledLaws => ({ ...NO_LAWS, broken: problem });

/**
 * Commands match case-insensitively: PowerShell is, and so is `GIT` on Windows. A pattern that does not
 * compile breaks the laws instead of being skipped (the domain refuses one in territory.json; a policy file
 * written by hand may still hold one).
 */
export function compileLaws(laws: LawsInput): CompiledLaws {
  const paths = (laws.forbidden_paths ?? []).map((glob) => ({ glob, regex: globToRegExp(glob) }));
  const commands = [];
  for (const source of laws.forbidden_commands ?? []) {
    try {
      commands.push({ source, regex: new RegExp(source, 'i') });
    } catch {
      return brokenLaws(`forbidden command pattern ${JSON.stringify(source)} is not a regular expression`);
    }
  }
  return { paths, commands, broken: undefined };
}

const DRIVE = /^[a-z]:$/i;

/**
 * One path segment as Windows reads it: `name:stream` and `name::$DATA` open `name`, and trailing dots and
 * spaces are dropped (`.env.` is `.env`). Harmless on macOS and Linux, where such names are rare.
 */
function cleanSegment(segment: string): string {
  if (segment === '.' || segment === '..' || DRIVE.test(segment)) return segment;
  const colon = segment.indexOf(':');
  const name = colon === -1 ? segment : segment.slice(0, colon);
  return name.replace(/[. ]+$/, '');
}

/** `raw` (backslashes or slashes, absolute or relative) as clean segments, `.` and `..` resolved. */
export function pathSegments(raw: string): string[] {
  const segments: string[] = [];
  for (const part of raw.replaceAll('\\', '/').split('/')) {
    const name = cleanSegment(part);
    if (name === '..') segments.pop();
    else if (name !== '' && name !== '.') segments.push(name);
  }
  return segments;
}

/**
 * The glob that forbids `raw`, if any. Every tail of the path is tried, so `infra/secrets/**` matches the
 * plot's folder, the territory's main checkout reached through `..`, and an absolute path alike.
 */
export function forbiddenPathOf(raw: string, laws: CompiledLaws): string | undefined {
  const segments = pathSegments(raw);
  for (let start = 0; start < segments.length; start += 1) {
    const tail = segments.slice(start).join('/');
    const law = laws.paths.find(({ regex }) => regex.test(tail));
    if (law !== undefined) return law.glob;
  }
  return undefined;
}

/** Quotes, backticks and escapes dropped, blanks collapsed: `"git" pu\sh` and `git   push` read `git push`. */
export const normalizeCommand = (command: string): string =>
  command
    .replace(/["'`]/g, '')
    .replace(/\\(?=[a-z])/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Words of a shell line that may name a file, in bash or PowerShell: split at blanks and operators. */
export const commandWords = (command: string): string[] =>
  command
    .replace(/["'`]/g, ' ')
    .split(/[\s;|&<>(){}=,]+/)
    .filter((word) => word !== '');

/**
 * Why `command` breaks the laws, if it does: a forbidden command pattern, or a word naming a forbidden path
 * (`cat .env`, `type C:\repo\.env`, `Get-Content -Path .env`; ADR 0013).
 */
export function commandViolation(command: string, laws: CompiledLaws): string | undefined {
  const variants = [command, normalizeCommand(command)];
  const law = laws.commands.find(({ regex }) => variants.some((variant) => regex.test(variant)));
  if (law !== undefined) return `the command matches the forbidden pattern ${law.source}`;
  for (const word of commandWords(command)) {
    const glob = forbiddenPathOf(word, laws);
    if (glob !== undefined) return `the command touches ${word}, a forbidden path (${glob})`;
  }
  return undefined;
}
