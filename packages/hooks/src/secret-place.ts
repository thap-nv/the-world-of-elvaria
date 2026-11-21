// The fence on the places that hold the owner's secrets (SEC-01, threat model V1): SSH keys, git's credential store, the
// treasury, the CLIs' sign-ins (policy `secret_paths`). A tool path or a word of a shell line that names one, at any
// depth, is refused for every tribe; the shell is the gap the read fence (outside.ts) leaves, and Codex's sandbox reads
// the whole disk (cli-facts 2026-11-21). A fence on the command line, not a sandbox: a program the line starts reads what
// it likes, and a name built at run time (`'.s' + 'sh'`) gets through (ADR 0007).
import path from 'node:path';
import process from 'node:process';

import { commandWords, matchingGlobOf } from './laws.ts';
import type { ToolCall } from './claude/tools.ts';
import type { CompiledLaws } from './laws.ts';

/** Shell commands that change the folder the rest of the line runs in, in bash, cmd and PowerShell. */
const FOLDER_CHANGES = new Set(['cd', 'chdir', 'pushd', 'set-location', 'push-location', 'sl']);

/**
 * A line that names the owner's home folder, so a relative word may be read from there (`Join-Path $HOME .ssh`,
 * `path.join(os.homedir(), '.claude')`): `~` opening a word, the home variables of bash, cmd, PowerShell, Node and
 * Python, and the calls that return the folder.
 */
const NAMES_HOME =
  /(?:^|[^\w@])~|\$\{?(?:env:)?(?:home|userprofile)\b|%(?:userprofile|homepath|home)%|homedir|expanduser|\b(?:env|environ)\b.{0,4}\b(?:home|userprofile)\b|\bpath\.home\b|getfolderpath/i;

/** Whether `raw`, read from `root`, stays inside it: a plain relative or absolute path, not one through a variable. */
function staysInside(root: string, raw: string): boolean {
  if (/^[~$%]/.test(raw)) return false;
  const relative = path.relative(root, path.resolve(root, raw));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Why `call` names a place that holds secrets, if it does. `cwd` is the session's folder as the CLI's payload names it
 * (outside.ts): a word inside it is the territory's own (Elvaria's repo has a `.claude/`), unless the line moves to
 * another folder or names the home folder, after which a relative word may be read from anywhere.
 */
export function secretPlaceViolation(
  call: ToolCall,
  cwd: string | undefined,
  laws: Pick<CompiledLaws, 'secretPaths'>,
): string | undefined {
  if (laws.secretPaths.length === 0) return undefined;
  const root = path.resolve(cwd ?? process.cwd());
  const words = call.command === undefined ? [] : commandWords(call.command);
  const anywhere =
    words.some((word) => FOLDER_CHANGES.has(word.toLowerCase())) || NAMES_HOME.test(call.command ?? '');
  for (const raw of [...call.guarded, ...words]) {
    if (!anywhere && staysInside(root, raw)) continue;
    const glob = matchingGlobOf(raw, laws.secretPaths);
    if (glob !== undefined) {
      return `${raw} names a place that holds the owner's secrets (${glob}): no session reads it, whatever its tools; a quest that needs a secret gets it in its env`;
    }
  }
  return undefined;
}
