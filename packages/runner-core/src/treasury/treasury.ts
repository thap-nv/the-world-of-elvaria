// The treasury (implementation-plan §3.9, ADR 0013): the owner's secrets, `{ "name": "value" }` in the file
// `kingdom.paths.treasury` (default `~/.elvaria/treasury.json`, outside the kingdom). A keychain can stand behind
// the same interface later. Nothing here ever puts a value in a message: errors name the file and the names only,
// and a JSON error is not quoted, because V8 quotes the text around the fault.
import { readFile, stat } from 'node:fs/promises';

import { REGISTRY_ID_PATTERN, err, ok } from '@elvaria/domain';
import type { Result } from '@elvaria/domain';

export interface Treasury {
  /** The names the treasury holds, sorted; never their values. */
  names(): Promise<string[]>;
  /** The values of `names`; rejects, naming what is missing, when the treasury lacks one of them. */
  resolve(names: readonly string[]): Promise<Record<string, string>>;
}

export interface FileTreasuryOptions {
  /** process.platform by default: the file's mode is checked on macOS and Linux, not on Windows. */
  readonly platform?: NodeJS.Platform;
}

/** The env variable a treasury name becomes in a session: `npm_token` → `NPM_TOKEN` (§3.7, `gemini_api_key`). */
export const secretEnvName = (name: string): string => name.toUpperCase();

/** Permission bits for the group and for others: a treasury file must have none (mode 0600). */
const SHARED_BITS = 0o077;
const OCTAL = 8;

/**
 * What makes a treasury file unusable. It carries a name or the mode, never a value, so `elvaria doctor` can say
 * it in the owner's language (implementation-plan §3.9 "(P1-10)", P1-11).
 */
export type TreasuryProblem =
  | { readonly kind: 'shared'; readonly mode: string }
  | { readonly kind: 'not_json' }
  | { readonly kind: 'not_object' }
  | { readonly kind: 'bad_name'; readonly name: string }
  | { readonly kind: 'bad_value'; readonly name: string };

/** A treasury file as `elvaria doctor` sees it: whether it exists, and the names it holds, sorted. */
export interface TreasuryContents {
  readonly found: boolean;
  readonly names: readonly string[];
}

const isMissing = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

async function textOf(
  file: string,
  platform: NodeJS.Platform,
): Promise<Result<string | undefined, TreasuryProblem>> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (isMissing(error)) return ok(undefined);
    throw error;
  }
  if (platform !== 'win32') {
    const mode = (await stat(file)).mode & 0o777;
    if ((mode & SHARED_BITS) !== 0) return err({ kind: 'shared', mode: mode.toString(OCTAL) });
  }
  return ok(text);
}

function entriesOf(text: string): Result<Map<string, string>, TreasuryProblem> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return err({ kind: 'not_json' });
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return err({ kind: 'not_object' });
  const entries = new Map<string, string>();
  for (const [name, secret] of Object.entries(value)) {
    if (!REGISTRY_ID_PATTERN.test(name)) return err({ kind: 'bad_name', name });
    if (typeof secret !== 'string' || secret === '') return err({ kind: 'bad_value', name });
    entries.set(name, secret);
  }
  return ok(entries);
}

/** The file's entries, nothing when it does not exist; a read error other than a missing file is thrown. */
async function entriesIn(
  file: string,
  platform: NodeJS.Platform,
): Promise<Result<Map<string, string> | undefined, TreasuryProblem>> {
  const text = await textOf(file, platform);
  if (!text.ok) return text;
  return text.value === undefined ? ok(undefined) : entriesOf(text.value);
}

/** The sentence a session's error carries: the file and a name at most, never a value. */
function problemMessage(file: string, problem: TreasuryProblem): string {
  switch (problem.kind) {
    case 'shared':
      return `treasury ${file} can be read by other users (mode ${problem.mode}); run: chmod 600 "${file}"`;
    case 'not_json':
      return `treasury ${file} is not valid JSON`;
    case 'not_object':
      return `treasury ${file} is not a JSON object of names and values`;
    case 'bad_name':
      return `treasury ${file}: "${problem.name}" is not a secret name (snake_case, like npm_token)`;
    case 'bad_value':
      return `treasury ${file}: the value of ${problem.name} is not a non-empty string`;
  }
}

/** What `elvaria doctor` reports: the file's names or what is wrong with it, read without keeping a value. */
export async function inspectTreasury(
  file: string,
  options: FileTreasuryOptions = {},
): Promise<Result<TreasuryContents, TreasuryProblem>> {
  const entries = await entriesIn(file, options.platform ?? process.platform);
  if (!entries.ok) return entries;
  return ok({
    found: entries.value !== undefined,
    names: [...(entries.value?.keys() ?? [])].sort(),
  });
}

/** The file treasury; read on every call, so an edit of the file counts from the next session on. */
export function openFileTreasury(file: string, options: FileTreasuryOptions = {}): Treasury {
  const platform = options.platform ?? process.platform;
  const load = async (): Promise<Map<string, string>> => {
    const entries = await entriesIn(file, platform);
    if (!entries.ok) throw new Error(problemMessage(file, entries.error));
    return entries.value ?? new Map();
  };
  return {
    names: async () => [...(await load()).keys()].sort(),
    resolve: async (names) => {
      if (names.length === 0) return {};
      const entries = await load();
      const missing = names.filter((name) => !entries.has(name));
      if (missing.length > 0) throw new Error(`treasury ${file} has no ${missing.join(', ')}`);
      return Object.fromEntries(names.map((name) => [name, entries.get(name) ?? '']));
    },
  };
}
