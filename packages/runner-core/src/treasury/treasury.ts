// The treasury (implementation-plan §3.9, ADR 0013): the owner's secrets, `{ "name": "value" }` in the file
// `kingdom.paths.treasury` (default `~/.elvaria/treasury.json`, outside the kingdom). A keychain can stand behind
// the same interface later. Nothing here ever puts a value in a message: errors name the file and the names only,
// and a JSON error is not quoted, because V8 quotes the text around the fault.
import { readFile, stat } from 'node:fs/promises';

import { REGISTRY_ID_PATTERN } from '@elvaria/domain';

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

const isMissing = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

async function textOf(file: string, platform: NodeJS.Platform): Promise<string | undefined> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  if (platform !== 'win32') {
    const mode = (await stat(file)).mode & 0o777;
    if ((mode & SHARED_BITS) !== 0)
      throw new Error(
        `treasury ${file} can be read by other users (mode ${mode.toString(OCTAL)}); run: chmod 600 "${file}"`,
      );
  }
  return text;
}

function entriesOf(file: string, text: string): Map<string, string> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`treasury ${file} is not valid JSON`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`treasury ${file} is not a JSON object of names and values`);
  const entries = new Map<string, string>();
  for (const [name, secret] of Object.entries(value)) {
    if (!REGISTRY_ID_PATTERN.test(name))
      throw new Error(`treasury ${file}: "${name}" is not a secret name (snake_case, like npm_token)`);
    if (typeof secret !== 'string' || secret === '')
      throw new Error(`treasury ${file}: the value of ${name} is not a non-empty string`);
    entries.set(name, secret);
  }
  return entries;
}

/** The file treasury; read on every call, so an edit of the file counts from the next session on. */
export function openFileTreasury(file: string, options: FileTreasuryOptions = {}): Treasury {
  const platform = options.platform ?? process.platform;
  const load = async (): Promise<Map<string, string>> => {
    const text = await textOf(file, platform);
    return text === undefined ? new Map() : entriesOf(file, text);
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
