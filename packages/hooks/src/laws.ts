// The territory laws the PreToolUse hook enforces: the second fence after the CLI's deny rules
// (implementation-plan §3.6, §3.9; ADR 0013). Deny rules are a fence, not a sandbox, so this one errs on the
// side of blocking: a forbidden path matches at any depth, in any case, under any spelling Windows accepts.
import { globToRegExp } from './glob.ts';

export interface LawsInput {
  readonly forbidden_paths?: readonly string[];
  /** Read freely, never written by a tool (P1-24): generated files, which the territory's generators rewrite. */
  readonly read_only_paths?: readonly string[];
  /** Changed by the Steward through the assignee's patch when the CLI refuses to write them (P1-28). */
  readonly patch_paths?: readonly string[];
  readonly forbidden_commands?: readonly string[];
}

/** What the adapter and runner-core add to the laws in the policy file. */
export interface LawExtras {
  /** Policy `cli_protected_paths` (P1-24). */
  readonly cliProtected?: readonly string[] | undefined;
  /** Policy `patch_file` (P1-28): where the assignee writes its patch; absent, no patch is offered. */
  readonly patchFile?: string | undefined;
}

export type CompiledPaths = readonly { readonly glob: string; readonly regex: RegExp }[];

export interface CompiledLaws {
  /** Neither read nor written. */
  readonly paths: CompiledPaths;
  /** Never written: by a write tool, or by a shell redirection or writer (P1-24). */
  readonly readOnly: CompiledPaths;
  /** Never written because the CLI itself refuses them (policy `cli_protected_paths`, P1-24); not a law. */
  readonly cliProtected: CompiledPaths;
  /** Of the CLI-protected paths, those the Steward patches for the assignee (P1-28); empty without a patch file. */
  readonly patchPaths: CompiledPaths;
  readonly patchFile: string | undefined;
  readonly commands: readonly { readonly source: string; readonly regex: RegExp }[];
  /** Why the laws could not be loaded; then every guarded call is blocked (fail closed). */
  readonly broken: string | undefined;
}

export const NO_LAWS: CompiledLaws = {
  paths: [],
  readOnly: [],
  cliProtected: [],
  patchPaths: [],
  patchFile: undefined,
  commands: [],
  broken: undefined,
};

export const brokenLaws = (problem: string): CompiledLaws => ({ ...NO_LAWS, broken: problem });

const compilePaths = (globs: readonly string[] = []): CompiledPaths =>
  globs.map((glob) => ({ glob, regex: globToRegExp(glob) }));

/**
 * Commands match case-insensitively: PowerShell is, and so is `GIT` on Windows. A pattern that does not
 * compile breaks the laws instead of being skipped (the domain refuses one in territory.json; a policy file
 * written by hand may still hold one).
 */
export function compileLaws(laws: LawsInput, extras: LawExtras = {}): CompiledLaws {
  const commands = [];
  for (const source of laws.forbidden_commands ?? []) {
    try {
      commands.push({ source, regex: new RegExp(source, 'i') });
    } catch {
      return brokenLaws(`forbidden command pattern ${JSON.stringify(source)} is not a regular expression`);
    }
  }
  return {
    paths: compilePaths(laws.forbidden_paths),
    readOnly: compilePaths(laws.read_only_paths),
    cliProtected: compilePaths(extras.cliProtected),
    // A policy written by hand may list patch paths without the file: then the change goes to the owner.
    patchPaths: extras.patchFile === undefined ? [] : compilePaths(laws.patch_paths),
    patchFile: extras.patchFile,
    commands,
    broken: undefined,
  };
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
 * The glob of `paths` that matches `raw`, if any. Every tail of the path is tried, so `infra/secrets/**` matches
 * the plot's folder, the territory's main checkout reached through `..`, and an absolute path alike.
 */
export function matchingGlobOf(raw: string, paths: CompiledPaths): string | undefined {
  const segments = pathSegments(raw);
  for (let start = 0; start < segments.length; start += 1) {
    const tail = segments.slice(start).join('/');
    const law = paths.find(({ regex }) => regex.test(tail));
    if (law !== undefined) return law.glob;
  }
  return undefined;
}

/** The forbidden-path glob that matches `raw`, if any. */
export const forbiddenPathOf = (raw: string, laws: CompiledLaws): string | undefined =>
  matchingGlobOf(raw, laws.paths);

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

/** Shell commands whose arguments are files they write, in bash and PowerShell. */
const WRITERS = new Set(['tee', 'out-file', 'set-content', 'add-content']);
/** The target of an output redirection: `> f`, `>> f`, `2> f`, `&> f`, `*> f`, `>| f`; not `2>&1`. */
const REDIRECT = />+\|?\s*([^\s;&|<>()]+)/g;

/**
 * Files the shell line itself writes: redirection targets, and the arguments of a writer starting a segment
 * (`… | tee f`, `Set-Content -Path f`). A program the line runs writes what it likes: that is a generator's job.
 */
export function shellWriteTargets(command: string): string[] {
  const plain = command.replace(/["'`]/g, '');
  const redirected = [...plain.matchAll(REDIRECT)].flatMap((match) => match[1] ?? []);
  const written = plain.split(/[;&|\n]+/).flatMap((segment) => {
    const [first, ...rest] = commandWords(segment);
    return first !== undefined && WRITERS.has(first.toLowerCase()) ? rest : [];
  });
  return [...redirected, ...written];
}

/**
 * Why `command` breaks the laws, if it does: a forbidden command pattern, a word naming a forbidden path
 * (`cat .env`, `type C:\repo\.env`, `Get-Content -Path .env`; ADR 0013), or a read-only path the line writes
 * itself (`pnpm docs:gen > docs/glossary.md`). Naming a read-only path is fine: `git add docs/glossary.md`.
 */
export function commandViolation(command: string, laws: CompiledLaws): string | undefined {
  const variants = [command, normalizeCommand(command)];
  const law = laws.commands.find(({ regex }) => variants.some((variant) => regex.test(variant)));
  if (law !== undefined) return `the command matches the forbidden pattern ${law.source}`;
  for (const word of commandWords(command)) {
    const glob = forbiddenPathOf(word, laws);
    if (glob !== undefined) return `the command touches ${word}, a forbidden path (${glob})`;
  }
  for (const target of shellWriteTargets(command)) {
    const glob = matchingGlobOf(target, laws.readOnly);
    if (glob !== undefined) return readOnlyReason(target, glob);
  }
  return undefined;
}

export const readOnlyReason = (raw: string, glob: string): string =>
  `${raw} is read-only (${glob}): only the territory's generators write it; change its source and run the generator`;
