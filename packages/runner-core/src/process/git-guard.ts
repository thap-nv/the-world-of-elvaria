// What a repository's own config may not make the Steward's git run (threat model A5 and V2, SEC-02, ADR 0023):
// code a session runs can write the territory's .git/config, and the git of plots, deliveries and the forge
// credential reads it, outside every sandbox. Git has no switch that skips a repository's config, so just before
// each call the config is listed with the scope of each entry, and `-c` switches, which outrank every file, put back
// what the owner's own files (system, global) say: no fsmonitor hook and no askpass program at all, the owner's ssh
// command (plain ssh without one), and the owner's credential helpers alone (an empty helper empties git's list, then
// each is named again in its order). The territory's hooks still run: they are its code, trusted like the owner's
// (B4), and plots and deliveries run them on purpose.
import { runToEnd } from './child.ts';
import type { Launch } from './program.ts';

/** Every entry git reads, with its scope: `scope NUL key LF value NUL`, or `scope NUL key NUL` with no value. */
const LISTING = ['config', '--list', '--show-scope', '-z'];
/** Reading config files is quick; the rest is a busy machine. */
const LISTING_TIMEOUT_MS = 30_000;
/** The owner's own files. Not `local` and `worktree` (the repository's) nor `command` (what an env passed). */
const TRUSTED_SCOPES: ReadonlySet<string> = new Set(['system', 'global']);
/** `credential.helper` and its per-URL form `credential.<url>.helper`: git keeps one list of both, in order. */
const HELPER = /^credential\.(?:.+\.)?helper$/;
/** What git runs without a `core.sshCommand`. */
const DEFAULT_SSH = 'ssh';

interface ConfigEntry {
  readonly scope: string;
  readonly key: string;
  /** undefined for a bare `key` line (true). */
  readonly value: string | undefined;
}

function entriesOf(listing: string): ConfigEntry[] {
  const fields = listing.split('\0');
  return fields.flatMap((scope, at): ConfigEntry[] => {
    const pair = fields[at + 1];
    if (at % 2 === 1 || pair === undefined) return [];
    const cut = pair.indexOf('\n');
    return [
      { scope, key: cut < 0 ? pair : pair.slice(0, cut), value: cut < 0 ? undefined : pair.slice(cut + 1) },
    ];
  });
}

/**
 * The switches for `listing`; for none (git could not read its config), the strictest: no helper at all. A helper
 * without a value, or under a key holding `=` (which `-c` cannot carry), is left out rather than guessed.
 */
export function gitGuardOf(listing: string | undefined): string[] {
  const trusted = entriesOf(listing ?? '').filter(
    ({ scope, value }) => TRUSTED_SCOPES.has(scope) && value !== undefined,
  );
  const ssh = trusted.findLast(({ key }) => key === 'core.sshcommand')?.value ?? DEFAULT_SSH;
  const helpers = trusted.filter(({ key }) => HELPER.test(key) && !key.includes('='));
  return [
    ...['-c', 'core.fsmonitor=false'],
    ...['-c', 'core.askPass='],
    ...['-c', `core.sshCommand=${ssh}`],
    ...['-c', 'credential.helper='],
    ...helpers.flatMap(({ key, value = '' }) => ['-c', `${key}=${value}`]),
  ];
}

type Env = Readonly<Record<string, string>>;

/** The listing git prints in `cwd`, or undefined when it could not (no folder, a broken config, no git). */
async function listingIn(launch: Launch, cwd: string, env: Env): Promise<string | undefined> {
  const run = await runToEnd(launch, LISTING, { cwd, env, timeout_ms: LISTING_TIMEOUT_MS });
  return run.code === 0 && !run.timed_out ? run.stdout : undefined;
}

/**
 * The `-c` switches to put before git's command in `cwd`, read there and then: the owner's conditional includes
 * (`includeIf "gitdir:…"`) count, and an edit of their files counts from the next call on.
 */
export async function gitGuard(launch: Launch, cwd: string, env: Env): Promise<string[]> {
  return gitGuardOf(await listingIn(launch, cwd, env));
}

/**
 * gitGuard for a git of many calls in the same few folders (a plot's): each folder is read once, so an edit of the
 * owner's files reaches that git in a folder it has not run in yet, or after a restart. The switches come from the
 * owner's files alone, so nothing the territory writes later is missed; a read that failed is not kept (a worktree
 * not added yet).
 */
export function gitGuards(launch: Launch, env: Env): (cwd: string) => Promise<string[]> {
  const read = new Map<string, Promise<string | undefined>>();
  return async (cwd) => {
    const listing = read.get(cwd) ?? listingIn(launch, cwd, env);
    read.set(cwd, listing);
    const switches = gitGuardOf(await listing);
    if ((await listing) === undefined) read.delete(cwd);
    return switches;
  };
}
