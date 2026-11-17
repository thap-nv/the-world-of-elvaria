// The GitHub adapter of the Steward's forge port (implementation-plan §3.16.7, ADR 0023; PS-08c). No package of its
// own and no change to boundaries.mjs ((M) of the plan): it lives in the composition root, over the CLI's fetch
// ((e) of PS-08). The token comes from git's credential store at every call (credential.ts) and is dropped after it;
// every message that leaves the adapter is masked with it, then the patterns of redact, so a forge that echoes the
// token back never puts it in an event, a log or the owner's terminal.
import { err, ok } from '@elvaria/domain';
import { createRedactor } from '@elvaria/eventlog';
import type { Result } from '@elvaria/domain';
import type { Forge, ForgeProblem, ForgeRepo } from '@elvaria/steward';

import { readCredential } from './credential.ts';
import { FORGE_TIMEOUT_MS, repoAccessOf } from './github.ts';
import { deleteBranch, mergePull } from './github-merge.ts';
import { openPull, pullStatus } from './github-pulls.ts';
import { forgeRepoOf } from './remote.ts';
import type { CliIo, Fetch } from '../io.ts';
import type { CredentialProblem } from './credential.ts';
import type { GithubCall } from './github-api.ts';

/** Where the adapter's token comes from: git's store (readCredential) in `elvaria run`, a fixed one in its specs. */
export type TokenSource = (repo: ForgeRepo) => Promise<Result<string, CredentialProblem>>;

const HOST = 'github.com';
const HTTP_NOT_FOUND = 404;

/** The token git keeps for github.com, asked in the territory's folder. */
export const gitToken =
  (io: CliIo): TokenSource =>
  async (repo) => {
    const found = await readCredential(io, repo.cwd, {
      forge: 'github',
      host: HOST,
      owner: repo.owner,
      name: repo.name,
    });
    return found.ok ? ok(found.value.password) : found;
  };

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A problem whose detail lost the token and the shapes of secrets. */
const masked = <P extends { readonly detail?: string }>(problem: P, token: string): P =>
  problem.detail === undefined ? problem : { ...problem, detail: createRedactor([token])(problem.detail) };

/** What the credential's account may do on `repo`, as `doctor` asks it (repoAccessOf). */
async function accessOf(
  call: GithubCall,
  repo: ForgeRepo,
): Promise<Result<'push' | 'read_only', ForgeProblem>> {
  const where = { forge: 'github' as const, host: HOST, owner: repo.owner, name: repo.name };
  const access = await repoAccessOf(call.fetch, where, call.token, call.timeoutMs);
  if (access.kind === 'push' || access.kind === 'read_only') return ok(access.kind);
  if (access.kind === 'refused') return err({ reason: 'forge_auth', detail: `HTTP ${access.status}` });
  return err({
    reason: 'forge_error',
    detail: access.kind === 'not_found' ? `HTTP ${HTTP_NOT_FOUND}` : access.detail,
  });
}

export interface GithubForgeOptions {
  readonly fetch: Fetch;
  readonly token: TokenSource;
  readonly timeoutMs?: number;
}

/** The adapter; each call asks for the token, makes its requests, and masks what it says. */
export function githubForge(options: GithubForgeOptions): Forge {
  const timeoutMs = options.timeoutMs ?? FORGE_TIMEOUT_MS;
  async function withToken<T, P extends { readonly reason: string; readonly detail?: string }>(
    repo: ForgeRepo,
    use: (call: GithubCall) => Promise<Result<T, P>>,
    signal?: AbortSignal,
  ): Promise<Result<T, P | ForgeProblem>> {
    const token = await options.token(repo);
    if (!token.ok)
      return err({ reason: 'no_credential', detail: `git has no credential for ${HOST}: ${token.error}` });
    try {
      const call = { fetch: options.fetch, token: token.value, timeoutMs };
      const done = await use(signal === undefined ? call : { ...call, signal });
      return done.ok ? done : err(masked(done.error, token.value));
    } catch (error) {
      return err({ reason: 'forge_error', detail: createRedactor([token.value])(messageOf(error)) });
    }
  }
  return {
    repoOf: (remote, cwd) => {
      const repo = forgeRepoOf(remote, 'github');
      return repo === undefined ? undefined : { owner: repo.owner, name: repo.name, cwd };
    },
    access: (repo, signal) => withToken(repo, (call) => accessOf(call, repo), signal),
    open: (repo, draft, signal) => withToken(repo, (call) => openPull(call, repo, draft), signal),
    status: (repo, pr, required, signal) =>
      withToken(repo, (call) => pullStatus(call, repo, pr, required), signal),
    merge: (repo, pr, merge, signal) => withToken(repo, (call) => mergePull(call, repo, pr, merge), signal),
    deleteBranch: (repo, branch, head, signal) =>
      withToken(repo, (call) => deleteBranch(call, repo, branch, head), signal),
  };
}
